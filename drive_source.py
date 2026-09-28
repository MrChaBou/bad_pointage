"""Lecture bornée d'un XLSX Drive, sans écriture ni cache du planning."""
import hashlib
import re
import time
import zipfile
from io import BytesIO
from pathlib import Path

import openpyxl
import requests
from urllib3.exceptions import TimeoutError as HTTPTimeout
from google.auth import exceptions as google_errors
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
FIELDS = 'name,mimeType,size,trashed,version,modifiedTime,md5Checksum,headRevisionId,capabilities(canDownload)'
MAX_BYTES = 10 * 1024 * 1024


class DriveError(Exception):
    def __init__(self, code, status):
        super().__init__(code)
        self.code, self.status = code, status


def authorized_session(path):
    if not path or not Path(path).is_absolute() or not Path(path).is_file():
        raise DriveError('drive_not_configured', 503)
    try:
        credentials = service_account.Credentials.from_service_account_file(path, scopes=[SCOPE])
        return AuthorizedSession(credentials, refresh_timeout=5, max_refresh_attempts=0)
    except (OSError, ValueError, google_errors.GoogleAuthError):
        raise DriveError('drive_credentials_invalid', 503) from None


def check_status(response):
    status = response.status_code
    if status == 200:
        return
    if status == 401:
        raise DriveError('drive_credentials_invalid', 503)
    if status == 404:
        raise DriveError('drive_file_unavailable', 502)
    if status == 403:
        try:
            errors = response.json().get('error', {}).get('errors', [])
            quota = any(e.get('reason') in ('rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded') for e in errors)
        except (ValueError, AttributeError, TypeError):
            quota = False
        raise DriveError('drive_unavailable' if quota else 'drive_access_denied', 503 if quota else 502)
    raise DriveError('drive_unavailable', 503)


def validate_xlsx(data):
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 10000 or sum(e.file_size for e in entries) > 50 * 1024 * 1024:
                raise ValueError('Archive limit')
            if not {'[Content_Types].xml', 'xl/workbook.xml'}.issubset(archive.namelist()):
                raise ValueError('Not XLSX')
            if archive.testzip() is not None:
                raise ValueError('Corrupt archive')
        wb = openpyxl.load_workbook(BytesIO(data), read_only=True, data_only=False, keep_links=False)
        try:
            if not wb.sheetnames:
                raise ValueError('Empty workbook')
        finally:
            wb.close()
    except Exception:
        raise DriveError('planning_invalid', 422) from None


def download(config):
    file_id = config.get('BAD_POINTAGE_DRIVE_FILE_ID')
    try:
        limit = int(config.get('BAD_POINTAGE_DRIVE_MAX_BYTES', MAX_BYTES))
        if limit <= 0 or not isinstance(file_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', file_id):
            raise ValueError()
    except (ValueError, TypeError):
        raise DriveError('drive_not_configured', 503) from None
    deadline = time.monotonic() + 30
    url = 'https://www.googleapis.com/drive/v3/files/' + file_id

    def remaining():
        value = deadline - time.monotonic()
        if value <= 0:
            raise DriveError('drive_timeout', 504)
        return min(5, value)

    try:
        with authorized_session(config.get('BAD_POINTAGE_GOOGLE_CREDENTIALS_FILE')) as session:
            def metadata():
                with session.get(url, params={'supportsAllDrives': 'true', 'fields': FIELDS},
                                 timeout=remaining(), allow_redirects=False) as response:
                    check_status(response)
                    result = response.json()
                remaining()
                if not isinstance(result, dict):
                    raise DriveError('planning_invalid', 422)
                return result

            before = metadata()
            if before.get('trashed'):
                raise DriveError('drive_file_unavailable', 502)
            if before.get('capabilities', {}).get('canDownload') is not True:
                raise DriveError('drive_access_denied', 502)
            if (before.get('mimeType') != MIME or not isinstance(before.get('name'), str)
                    or len(before['name']) > 512 or not before['name'].lower().endswith('.xlsx')
                    or not re.fullmatch(r'[0-9]+', str(before.get('version', '')))):
                raise DriveError('planning_invalid', 422)
            size = int(before.get('size', 0))
            if not 0 < size <= limit:
                raise DriveError('planning_invalid', 422)
            chunks, received = [], 0
            with session.get(url, params={'supportsAllDrives': 'true', 'alt': 'media'},
                             timeout=remaining(), stream=True, allow_redirects=False) as response:
                check_status(response)
                for chunk in response.iter_content(chunk_size=65536):
                    remaining()
                    received += len(chunk)
                    if received > limit:
                        raise DriveError('planning_invalid', 422)
                    chunks.append(chunk)
            data = b''.join(chunks)
            after = metadata()
            if any(before.get(key) != after.get(key) for key in
                   ('version', 'modifiedTime', 'size', 'md5Checksum', 'headRevisionId')):
                raise DriveError('drive_source_changed', 409)
            if len(data) != size:
                raise DriveError('planning_invalid', 422)
            checksum = before.get('md5Checksum')
            if checksum and checksum != hashlib.md5(data, usedforsecurity=False).hexdigest():
                raise DriveError('planning_invalid', 422)
            validate_xlsx(data)
            info = {'name': before['name'], 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                    'modifiedTime': before.get('modifiedTime'), 'driveVersion': before['version'],
                    'headRevisionId': before.get('headRevisionId'), 'md5Checksum': checksum}
            return data, info
    except DriveError:
        raise
    except requests.exceptions.Timeout:
        raise DriveError('drive_timeout', 504) from None
    except google_errors.RefreshError as error:
        raise DriveError('drive_unavailable' if error.retryable else 'drive_credentials_invalid', 503) from None
    except (requests.exceptions.RequestException, google_errors.TransportError) as error:
        # google-auth encapsule les timeouts du point de terminaison OAuth.
        cause = error
        seen = set()
        while isinstance(cause, BaseException) and id(cause) not in seen:
            seen.add(id(cause))
            if isinstance(cause, (requests.exceptions.Timeout, TimeoutError, HTTPTimeout)):
                raise DriveError('drive_timeout', 504) from None
            cause = cause.__cause__ or cause.__context__ or next(
                (arg for arg in cause.args if isinstance(arg, BaseException)), None)
        raise DriveError('drive_unavailable', 503) from None
    except (ValueError, TypeError, AttributeError):
        raise DriveError('planning_invalid', 422) from None
