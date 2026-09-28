"""Responsible access only; no business data and no administrator API."""
import hashlib
import secrets
import time

from werkzeug.security import check_password_hash, generate_password_hash
from auth_store import AuthStore, StoreUnavailable

LIFETIME = 4 * 60 * 60
ATTEMPT_WINDOW = 5 * 60
ATTEMPT_LIMIT = 10
HASH_METHOD = 'scrypt:32768:8:1'


class Unauthorized(Exception):
    pass


class RateLimited(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after


def fingerprint(token):
    return hashlib.sha256(token.encode('ascii')).hexdigest()


def initialize(path, code):
    """Explicit bootstrap only. Never overwrite existing state or reset generation."""
    if not isinstance(code, str) or not 12 <= len(code) <= 256:
        raise ValueError('Le code doit contenir entre 12 et 256 caractères.')
    digest = generate_password_hash(code, method=HASH_METHOD, salt_length=16)
    store = AuthStore(path)
    with store.locked():
        if store.path.exists() or store.path.is_symlink():
            raise StoreUnavailable()
        store.write(dict(schema=1, code_hash=digest, generation=1, sessions={}, attempts=[]))


def login(path, code):
    store = AuthStore(path)
    with store.locked():
        state = store.read()
        now = int(time.time())
        attempts = [t for t in state['attempts'] if t > now - ATTEMPT_WINDOW]
        if len(attempts) >= ATTEMPT_LIMIT:
            raise RateLimited(max(1, min(attempts) + ATTEMPT_WINDOW - now))
        # Count every attempt, including successes; persisted before expensive hashing.
        state['attempts'] = attempts + [now]
        state['sessions'] = {k: v for k, v in state['sessions'].items()
                             if v['expires_at'] > now and v['generation'] == state['generation']}
        store.write(state)
        if not isinstance(code, str) or not 1 <= len(code) <= 256:
            raise Unauthorized()
        try:
            valid = check_password_hash(state['code_hash'], code)
        except (ValueError, MemoryError):
            raise StoreUnavailable() from None
        if not valid:
            raise Unauthorized()
        if len(state['sessions']) >= 1000:
            raise StoreUnavailable()
        now = int(time.time())
        token = secrets.token_urlsafe(32)
        expires_at = now + LIFETIME
        state['sessions'][fingerprint(token)] = dict(
            role='responsible', generation=state['generation'], expires_at=expires_at)
        store.write(state)
        return token, expires_at


def session(path, token, revoke=False):
    store = AuthStore(path)
    with store.locked():
        state = store.read()
        record = state['sessions'].get(fingerprint(token))
        if (record is None or record['role'] != 'responsible'
                or record['generation'] != state['generation']
                or record['expires_at'] <= int(time.time())):
            raise Unauthorized()
        if revoke:
            del state['sessions'][fingerprint(token)]
            store.write(state)
        return {'role': record['role'], 'expires_at': record['expires_at']}
