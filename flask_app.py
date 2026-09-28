# flask_app.py (à mettre sur PythonAnywhere)

import base64
import re
import os
from functools import wraps
import auth
from auth_store import StoreUnavailable
from flask import Flask, request, jsonify
from flask_cors import CORS
import openpyxl
from io import BytesIO

from copy import copy
from colorsys import rgb_to_hls, hls_to_rgb
from xml.etree import ElementTree
from openpyxl.styles import Color
from openpyxl.styles.colors import COLOR_INDEX


# Indices SpreadsheetML : l'ordre XML dk1/lt1 n'est pas l'ordre des indices.
THEME_COLORS = ('lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2',
                'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink')


def planning_theme_colors(workbook):
    if not workbook.loaded_theme:
        return {}
    root = ElementTree.fromstring(workbook.loaded_theme)
    scheme = root.find('.//{*}clrScheme')
    if scheme is None:
        return {}
    colors = {}
    for index, name in enumerate(THEME_COLORS):
        entry = scheme.find('{*}' + name)
        if entry is not None and len(entry):
            value = entry[0]
            colors[index] = value.get('lastClr') or value.get('val')
    return colors


def planning_color_rgb(color, themes, indexed=COLOR_INDEX):
    if color is None:
        return None
    if color.type == 'rgb':
        value = color.rgb
    elif color.type == 'theme':
        value = themes.get(color.theme)
    elif color.type == 'indexed' and 0 <= color.indexed < len(indexed):
        value = indexed[color.indexed]
    else:
        return None
    if not isinstance(value, str) or not re.fullmatch(r'(?:[0-9a-fA-F]{2})?[0-9a-fA-F]{6}', value):
        return None
    rgb = tuple(int(value[-6:][i:i + 2], 16) / 255 for i in (0, 2, 4))
    if color.tint:
        h, light, saturation = rgb_to_hls(*rgb)
        light = light * (1 + color.tint) if color.tint < 0 else light * (1 - color.tint) + color.tint
        rgb = hls_to_rgb(h, light, saturation)
    return rgb


def planning_luminance(rgb):
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb]
    return sum(v * weight for v, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def planning_contrast(first, second):
    a, b = sorted((planning_luminance(first), planning_luminance(second)))
    return (b + 0.05) / (a + 0.05)


def ensure_marker_contrast(cell, themes, indexed=COLOR_INDEX):
    """Changer uniquement la couleur d'un marqueur dont le contraste est < 4,5:1."""
    if cell.value not in ('V', 'ESSAI PRESENT', 'ESSAI ABSENT'):
        return
    if cell.fill.fill_type == 'solid':
        background = planning_color_rgb(cell.fill.fgColor, themes, indexed)
    elif cell.fill.fill_type in (None, 'none'):
        background = (1, 1, 1)
    else:
        return  # Un motif ou dégradé n'a pas de fond uniforme déductible.
    foreground = planning_color_rgb(cell.font.color, themes, indexed)
    if background is None or foreground is None or planning_contrast(background, foreground) >= 4.5:
        return
    replacement = max(((0, 0, 0), (1, 1, 1)), key=lambda rgb: planning_contrast(background, rgb))
    # Préférer une couleur de thème uniquement si elle représente bien le RGB choisi.
    replacement_color = Color(rgb='FFFFFFFF' if replacement[0] else 'FF000000')
    for index in (0, 1):
        if planning_color_rgb(Color(theme=index), themes) == replacement:
            replacement_color = Color(theme=index)
            break
    font = copy(cell.font)
    font.color = replacement_color
    cell.font = font


app = Flask(__name__)
app.config['BAD_POINTAGE_AUTH_FILE'] = os.environ.get('BAD_POINTAGE_AUTH_FILE')

# Origines autorisées : serveurs frontend locaux et GitHub Pages.
CORS(app, origins=[
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'https://mrchabou.github.io',
], allow_headers=['Authorization', 'Content-Type'],
   expose_headers=['Retry-After'], methods=['GET', 'POST', 'OPTIONS'])

def responsible_token():
    header = request.headers.get('Authorization', '')
    match = re.fullmatch(r'(?i:Bearer) ([A-Za-z0-9_-]{43})', header)
    if not match:
        raise auth.Unauthorized()
    return match.group(1)


def require_responsible(view):
    @wraps(view)
    def guarded(*args, **kwargs):
        auth.session(app.config.get('BAD_POINTAGE_AUTH_FILE'), responsible_token())
        return view(*args, **kwargs)
    return guarded


@app.errorhandler(auth.Unauthorized)
def unauthorized(_error):
    response = jsonify(error='unauthorized')
    response.status_code = 401
    response.headers['WWW-Authenticate'] = 'Bearer'
    return response


@app.errorhandler(auth.RateLimited)
def rate_limited(error):
    response = jsonify(error='too_many_attempts')
    response.status_code = 429
    response.headers['Retry-After'] = str(error.retry_after)
    return response


@app.errorhandler(StoreUnavailable)
def auth_unavailable(_error):
    return jsonify(error='auth_unavailable'), 503


@app.after_request
def private_responses(response):
    if request.path.startswith('/auth/') or request.path == '/update-planning':
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.route('/auth/session', methods=['GET'])
def auth_session():
    return jsonify(auth.session(app.config.get('BAD_POINTAGE_AUTH_FILE'), responsible_token()))


@app.route('/auth/logout', methods=['POST'])
def auth_logout():
    auth.session(app.config.get('BAD_POINTAGE_AUTH_FILE'), responsible_token(), revoke=True)
    return '', 204


@app.route('/update-planning', methods=['POST'])
@require_responsible
def update_planning():
    try:
        data = request.json
        
        # 1. Décoder le fichier Excel reçu en base64
        excel_data = base64.b64decode(data['file'])
        excel_file = BytesIO(excel_data)
        
        # 2. Charger le classeur avec openpyxl en préservant les styles
        wb = openpyxl.load_workbook(excel_file)
        ws = wb[data['sheet']]
        
        # 3. Récupérer les informations de la requête
        col_idx_target = data['columnIndex'] + 1  # openpyxl est base 1, JS est base 0
        presences = data.get('presences', [])
        
        # Recenser les seules lignes participants avant toute écriture.
        participant_rows = {}
        for row in range(4, ws.max_row + 1):
            stop_text = ' '.join(str(ws.cell(row=row, column=col).value or '') for col in range(1, 5))
            stop_text = stop_text.lower().replace('\u2018', "'").replace('\u2019', "'").replace('\u02bc', "'")
            if "liste d'attente" in ' '.join(stop_text.split()):
                break
            nom = ws.cell(row=row, column=2).value
            prenom = ws.cell(row=row, column=3).value
            if not nom or not prenom or not str(nom).strip() or not str(prenom).strip():
                continue
            participant_rows[row] = (str(nom).strip().lower(), str(prenom).strip().lower())

        present_rows = set()
        legacy_names = set()
        for presence in presences:
            if not isinstance(presence, dict) or not all(
                isinstance(presence.get(field), str) and presence[field].strip()
                for field in ('nom', 'prenom')
            ):
                return jsonify(success=False, error='Identité de présence invalide'), 400
            identity = (presence['nom'].strip().lower(), presence['prenom'].strip().lower())
            if 'id' not in presence:
                # Compatibilité avec les anciens frontends uniquement sans ID.
                legacy_names.add(identity)
                continue
            participant_id = presence['id']
            # padStart(3) : trois chiffres minimum, aucun zéro superflu au-delà.
            if not isinstance(participant_id, str) or not re.fullmatch(
                r'P(?:[0-9]{3}|[1-9][0-9]{3,6})', participant_id
            ):
                return jsonify(success=False, error='ID de présence invalide'), 400
            row = int(participant_id[1:]) + 1  # SheetJS base 0 -> openpyxl base 1
            if row not in participant_rows or participant_rows[row] != identity:
                return jsonify(success=False, error='ID de présence incompatible avec la ligne source'), 400
            present_rows.add(row)

        themes = planning_theme_colors(wb)
        # Tous les IDs sont validés avant de modifier la moindre cellule.
        for row, identity in participant_rows.items():
            target_cell = ws.cell(row=row, column=col_idx_target)
            is_present = row in present_rows or identity in legacy_names
            is_essai = str(target_cell.value or '').strip().upper() in ('ESSAI', 'ESSAI PRESENT', 'ESSAI ABSENT')
            if is_essai:
                target_cell.value = 'ESSAI PRESENT' if is_present else 'ESSAI ABSENT'
            else:
                target_cell.value = 'V' if is_present else None
            ensure_marker_contrast(target_cell, themes, wb._colors)

        # 6. Sauvegarder le fichier modifié en mémoire
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        
        # 7. Renvoyer le fichier en base64 au frontend
        return jsonify({
            'success': True,
            'file': base64.b64encode(output.read()).decode('utf-8'),
            'filename': data.get('filename', 'planning_mis_a_jour.xlsx')
        })
        
    except Exception:
        app.logger.error('Echec du traitement du planning')
        return jsonify({'success': False, 'error': 'Export impossible'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """
    Un simple point de terminaison pour vérifier que le serveur est en ligne.
    Le frontend l'utilisera pour déterminer s'il peut préserver les styles.
    """
    return jsonify({'status': 'ok'})
