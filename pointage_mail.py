"""SMTP in memory; private delivery receipts contain no workbook or free text."""
import base64
import hashlib
import json
import os
import re
import smtplib
import sqlite3
import ssl
from datetime import datetime
from zoneinfo import ZoneInfo
from email.message import EmailMessage
from auth_store import AuthStore


def settings():
    def env(key):
        return os.environ.get('BAD_POINTAGE_MAIL_' + key, '')
    mode = env('MODE') or 'test'
    if mode not in ('test', 'production'):
        raise ValueError()
    recipient = env('TEST_TO' if mode == 'test' else 'PRODUCTION_TO')
    sender = env('FROM')
    for address in (recipient, sender):
        if not re.fullmatch(r'[^\s<>;, @]+@[^\s<>;, @]+', address):
            raise ValueError()
    if mode == 'test' and recipient.casefold() == env('PRODUCTION_TO').casefold():
        raise ValueError()
    port = int(env('PORT') or '587')
    if port not in (465, 587) or not all((env('HOST'), env('USER'), env('PASSWORD'))):
        raise ValueError()
    return dict(mode=mode, to=recipient, sender=sender, port=port,
                host=env('HOST'), user=env('USER'), password=env('PASSWORD'))


def validate(data, config):
    if not isinstance(data, dict) or data.get('mode') != config['mode']:
        raise ValueError()
    for key, limit in [('note', 2000), ('sheet', 200), ('date', 40),
                       ('sourceModified', 80), ('filename', 200)]:
        if not isinstance(data.get(key), str) or len(data[key]) > limit:
            raise ValueError()
    if not re.fullmatch(r'[\w .()-]+\.xlsx', data['filename'], re.UNICODE):
        raise ValueError()
    if not re.fullmatch(r'[0-9a-f-]{36}', data.get('attemptId', '')):
        raise ValueError()
    if not re.fullmatch(r'[0-9a-f]{64}', data.get('sourceHash', '')):
        raise ValueError()
    source = base64.b64decode(data['file'], validate=True)
    if hashlib.sha256(source).hexdigest() != data['sourceHash']:
        raise ValueError()
    if type(data.get('columnIndex')) is not int or not 0 <= data['columnIndex'] < 16384:
        raise ValueError()
    if not isinstance(data.get('presences'), list):
        raise ValueError()
    for key in ('participants', 'essais'):
        if type(data.get(key)) is not int or not 0 <= data[key] <= 100000:
            raise ValueError()
    if len(data['presences']) > data['participants'] or data['essais'] > data['participants']:
        raise ValueError()


def receipt(path, attempt, digest, state=None):
    # Reuse the existing private directory checks and cross-worker lock.
    with AuthStore(path).locked():
        with sqlite3.connect(str(path) + '.mail.sqlite3', timeout=2) as db:
            db.execute('CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, digest TEXT, state TEXT)')
            row = db.execute('SELECT digest, state FROM receipts WHERE id=?', (attempt,)).fetchone()
            if row and row[0] != digest:
                raise ValueError()
            if state is not None:
                db.execute('UPDATE receipts SET state=? WHERE id=?', (state, attempt))
            elif row:
                return row[1]
            else:
                db.execute('INSERT INTO receipts VALUES (?, ?, ?)', (attempt, digest, 'uncertain'))
    return None


def deliver(path, config, data, attachment):
    digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    previous = receipt(path, data['attemptId'], digest)
    if previous:
        return previous
    message = EmailMessage()
    message['From'] = config['sender']
    message['To'] = config['to']
    # Business date has no timezone; only the sending timestamp is localized.
    business_date = data['date']
    for pattern in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            business_date = datetime.strptime(data['date'], pattern).strftime('%d-%m-%Y')
            break
        except ValueError:
            continue
    # Worksheet names may contain newlines; a mail subject must stay on one line.
    subject_sheet = ' '.join(data['sheet'].split())
    subject_date = ' '.join(business_date.split())
    message['Subject'] = ('[TEST] ' if config['mode'] == 'test' else '') + (
        f'Pointage du créneau {subject_sheet} — {subject_date}')
    message['Message-ID'] = '<' + data['attemptId'] + '@bad-pointage.invalid>'
    attempted_at = datetime.now(ZoneInfo('Europe/Paris')).strftime('%d-%m-%Y à %H:%M:%S (%Z)')
    message.set_content('\n'.join([
        'Bonjour Julien,', 'Voici le pointage suivant :', '',
        'Créneau : ' + data['sheet'], 'Date : ' + business_date,
        f"Participants inscrits : {data['participants']}", f"Présents : {len(data['presences'])}",
        f"Absents : {data['participants'] - len(data['presences'])}",
        f"En essai : {data['essais']}", 'Fichier : ' + data['filename'],
        '', 'Note du responsable de créneau pour réconcilier le fichier ci-joint avec le fichier central :',
        data['note'], '', 'Informations techniques',
        'Tentative d’envoi : ' + attempted_at,
        'Source modifiée : ' + (data['sourceModified'] or 'non disponible'),
        'SHA-256 source : ' + data['sourceHash']]))
    message.add_attachment(base64.b64decode(attachment), maintype='application',
                           subtype='vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                           filename=data['filename'])
    connection = None
    sending = False
    state = 'not_sent'
    try:
        context = ssl.create_default_context()
        if config['port'] == 465:
            connection = smtplib.SMTP_SSL(config['host'], 465, timeout=20, context=context)
        else:
            connection = smtplib.SMTP(config['host'], 587, timeout=20)
            connection.starttls(context=context)
        connection.login(config['user'], config['password'])
        sending = True
        refused = connection.send_message(message)
        state = 'not_sent' if refused else 'sent'
    except (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPDataError):
        state = 'not_sent'
    except Exception:
        state = 'uncertain' if sending else 'not_sent'
    finally:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
    receipt(path, data['attemptId'], digest, state)
    return state
