"""Isolated synthetic credentials; never uses deployment configuration."""
from contextlib import contextmanager
from pathlib import Path
import tempfile
from unittest.mock import patch

from auth import initialize
from flask_app import app

TEST_CODE = 'synthetic-test-code-only'


@contextmanager
def authenticated_client():
    with tempfile.TemporaryDirectory() as directory:
        path = str(Path(directory) / 'auth-state.json')
        initialize(path, TEST_CODE)
        with patch.dict(app.config, BAD_POINTAGE_AUTH_FILE=path):
            client = app.test_client()
            response = client.post('/auth/login', json={'code': TEST_CODE})
            assert response.status_code == 200
            client.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ' + response.json['token']
            yield client
