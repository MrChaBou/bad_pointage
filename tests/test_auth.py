import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from auth import initialize, login, session, Unauthorized
from auth_store import AuthStore, StoreUnavailable
from flask_app import app

CODE = 'synthetic-auth-test-only'


def worker_login(path, queue):
    try:
        token, expiry = login(path, CODE)
        queue.put(('ok', hashlib.sha256(token.encode()).hexdigest()))
    except Exception:
        queue.put(('failed', None))


def hold_lock(path, ready):
    with AuthStore(path).locked():
        ready.set()
        time.sleep(30)


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / 'auth-state.json')
        initialize(self.path, CODE)
        self.config = patch.dict(app.config, BAD_POINTAGE_AUTH_FILE=self.path)
        self.config.start()
        self.addCleanup(self.config.stop)
        self.client = app.test_client()

    def connect(self):
        response = self.client.post('/auth/login', json={'code': CODE})
        self.assertEqual(response.status_code, 200)
        return response.json['token'], response.json['expires_at']

    def headers(self, token):
        return {'Authorization': 'Bearer ' + token}

    def mutate(self, fn):
        store = AuthStore(self.path)
        with store.locked():
            state = store.read()
            fn(state)
            store.write(state)

    def test_login_session_logout_and_no_plaintext_persistence(self):
        before = int(time.time())
        token, expiry = self.connect()
        self.assertTrue(before + 14400 <= expiry <= int(time.time()) + 14400)
        text = Path(self.path).read_text()
        self.assertNotIn(CODE, text)
        self.assertNotIn(token, text)
        self.assertIn(hashlib.sha256(token.encode()).hexdigest(), text)
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o600)
        headers = self.headers(token)
        response = self.client.get('/auth/session', headers=headers)
        self.assertEqual(response.json, {'role': 'responsible', 'expires_at': expiry})
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(self.client.post('/auth/logout', headers=headers).status_code, 204)
        self.assertEqual(self.client.get('/auth/session', headers=headers).status_code, 401)
        self.assertEqual(self.client.post('/auth/logout', headers=headers).status_code, 401)

    def test_bad_codes_payloads_and_rate_limit_survive_new_client(self):
        for payload in ({'code': 'wrong'}, {}, [], {'code': None}, {'code': 4}, {'code': 'x' * 257}):
            self.assertEqual(self.client.post('/auth/login', json=payload).status_code, 401)
        for _ in range(4):
            self.assertEqual(self.client.post('/auth/login', data='bad', content_type='application/json').status_code, 401)
        response = app.test_client().post('/auth/login', json={'code': CODE})
        self.assertEqual(response.status_code, 429)
        self.assertTrue(1 <= int(response.headers['Retry-After']) <= 300)
        with patch('auth.time.time', return_value=time.time() + 301):
            self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 200)

    def test_health_public_and_export_rejected_before_parsing(self):
        self.assertEqual(self.client.get('/health').status_code, 200)
        with patch('flask_app.openpyxl.load_workbook') as load:
            for authorization in ('', 'Basic abc', 'Bearer fake', 'Bearer ' + 'A' * 43):
                response = self.client.post('/update-planning', headers={'Authorization': authorization}, json={})
                self.assertEqual(response.status_code, 401)
            load.assert_not_called()

    def test_expiry_generation_and_no_sliding_expiry(self):
        token, expiry = self.connect()
        headers = self.headers(token)
        with patch('auth.time.time', return_value=expiry - 1):
            self.assertEqual(self.client.get('/auth/session', headers=headers).json['expires_at'], expiry)
        with patch('auth.time.time', return_value=expiry):
            self.assertEqual(self.client.get('/auth/session', headers=headers).status_code, 401)
        self.mutate(lambda state: state.update(generation=state['generation'] + 1))
        self.assertEqual(self.client.get('/auth/session', headers=headers).status_code, 401)
        self.assertEqual(self.client.post('/update-planning', headers=headers, json={}).status_code, 401)

    def test_no_other_role_is_accepted(self):
        token, _ = self.connect()
        state = json.loads(Path(self.path).read_text())
        state['sessions'][hashlib.sha256(token.encode()).hexdigest()]['role'] = 'admin'
        Path(self.path).write_text(json.dumps(state))
        self.assertEqual(self.client.get('/auth/session', headers=self.headers(token)).status_code, 503)

    def test_configuration_missing_corrupt_or_insecure_is_closed(self):
        token, _ = self.connect()
        for path in (None, '', 'relative.json', '/nonexistent-private-dir/auth.json'):
            with patch.dict(app.config, BAD_POINTAGE_AUTH_FILE=path):
                self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 503)
                self.assertEqual(self.client.get('/auth/session', headers=self.headers(token)).status_code, 503)
                self.assertEqual(self.client.get('/health').status_code, 200)
        for content in ('{', '{}', '[]', 'null'):
            Path(self.path).write_text(content)
            self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 503)
        Path(self.path).unlink()
        self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 503)
        initialize(self.path, CODE)
        os.chmod(self.path, 0o644)
        self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 503)

    def test_cors_preflight_errors_and_disallowed_origin(self):
        origin = 'https://mrchabou.github.io'
        response = self.client.options('/update-planning', headers={
            'Origin': origin, 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('authorization', response.headers['Access-Control-Allow-Headers'].lower())
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], origin)
        self.assertNotIn('Access-Control-Allow-Credentials', response.headers)
        response = self.client.get('/auth/session', headers={'Origin': origin})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], origin)
        self.assertNotIn('Access-Control-Allow-Origin', self.client.get('/health', headers={'Origin': 'https://untrusted.invalid'}).headers)

    def test_atomic_failure_keeps_previous_state(self):
        original = Path(self.path).read_bytes()
        with patch('auth_store.os.replace', side_effect=OSError('private detail')):
            self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 503)
        self.assertEqual(Path(self.path).read_bytes(), original)
        self.assertEqual(list(Path(self.directory.name).glob('*.tmp')), [])

    def test_bootstrap_never_overwrites(self):
        original = Path(self.path).read_bytes()
        with self.assertRaises(StoreUnavailable):
            initialize(self.path, 'another-synthetic-code')
        self.assertEqual(Path(self.path).read_bytes(), original)

    def test_concurrent_processes_do_not_lose_sessions(self):
        ctx = multiprocessing.get_context('spawn')
        queue = ctx.Queue()
        processes = [ctx.Process(target=worker_login, args=(self.path, queue)) for _ in range(4)]
        for process in processes:
            process.start()
        for process in processes:
            process.join(20)
            self.assertEqual(process.exitcode, 0)
        results = [queue.get(timeout=2) for _ in processes]
        self.assertTrue(all(status == 'ok' for status, _ in results))
        state = json.loads(Path(self.path).read_text())
        self.assertEqual(set(state['sessions']), {digest for _, digest in results})
        self.assertEqual(len(state['attempts']), 4)
        queue.close()

    def test_lock_timeout_and_process_death_release(self):
        ctx = multiprocessing.get_context('spawn')
        ready = ctx.Event()
        process = ctx.Process(target=hold_lock, args=(self.path, ready))
        process.start()
        try:
            self.assertTrue(ready.wait(10))
            self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 503)
        finally:
            process.terminate()
            process.join(5)
        self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 200)

    def test_error_responses_and_logs_do_not_echo_inputs(self):
        with patch.object(app.logger, 'error') as log:
            response = self.client.post('/auth/login', json={'code': 'sensitive-input'})
            self.assertNotIn('sensitive-input', response.get_data(as_text=True))
            token, _ = self.connect()
            with patch('flask_app.openpyxl.load_workbook', side_effect=ValueError('sensitive-input')):
                response = self.client.post('/update-planning', headers=self.headers(token), json={'file': 'AA=='})
            self.assertNotIn('sensitive-input', response.get_data(as_text=True))
            self.assertNotIn('sensitive-input', str(log.call_args_list))
            self.assertNotIn(token, str(log.call_args_list))

    def test_logout_does_not_revoke_other_sessions(self):
        first, _ = self.connect()
        second, _ = self.connect()
        self.assertEqual(self.client.post('/auth/logout', headers=self.headers(first)).status_code, 204)
        self.assertEqual(self.client.get('/auth/session', headers=self.headers(second)).status_code, 200)

    def test_cors_on_unavailable_and_limited_responses(self):
        headers = {'Origin': 'https://mrchabou.github.io'}
        with patch.dict(app.config, BAD_POINTAGE_AUTH_FILE=None):
            response = self.client.post('/auth/login', json={'code': CODE}, headers=headers)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], headers['Origin'])
        self.mutate(lambda state: state.update(attempts=[int(time.time())] * 10))
        response = self.client.post('/auth/login', json={'code': CODE}, headers=headers)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], headers['Origin'])
        self.assertIn('Retry-After', response.headers['Access-Control-Expose-Headers'])

    def test_private_path_and_symlink_protection(self):
        with self.assertRaises(StoreUnavailable):
            AuthStore(str(Path(__file__).resolve().parent.parent / 'auth-state.json'))
        real = Path(self.directory.name) / 'original'
        Path(self.path).rename(real)
        Path(self.path).symlink_to(real)
        self.assertEqual(self.client.post('/auth/login', json={'code': CODE}).status_code, 503)
        self.assertTrue(real.exists())
