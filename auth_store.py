"""Private, small auth state. POSIX workers must share the same stable lock file."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time

try:
    import fcntl
except ImportError:  # Fail closed on unsupported hosts.
    fcntl = None


class StoreUnavailable(Exception):
    pass


def _integer(value):
    return type(value) is int and value >= 0


def _require(condition):
    if not condition:
        raise StoreUnavailable()


def validate(state):
    try:
        _require(isinstance(state, dict))
        _require(set(state) == {'schema', 'code_hash', 'generation', 'sessions', 'attempts'})
        _require(type(state['schema']) is int and state['schema'] == 1)
        _require(_integer(state['generation']))
        _require(re.fullmatch(r'scrypt:32768:8:1\$[A-Za-z0-9]{16}\$[0-9a-f]{128}', state['code_hash']))
        _require(isinstance(state['sessions'], dict) and len(state['sessions']) <= 1000)
        for digest, session in state['sessions'].items():
            _require(re.fullmatch(r'[0-9a-f]{64}', digest))
            _require(isinstance(session, dict))
            _require(set(session) == {'role', 'generation', 'expires_at'})
            _require(session['role'] == 'responsible')
            _require(_integer(session['generation']) and _integer(session['expires_at']))
        _require(isinstance(state['attempts'], list) and len(state['attempts']) <= 10)
        _require(all(_integer(t) for t in state['attempts']))
    except (TypeError, KeyError, ValueError):
        raise StoreUnavailable() from None


class AuthStore:
    def __init__(self, path, timeout=2.0):
        if not isinstance(path, (str, os.PathLike)) or not str(path):
            raise StoreUnavailable()
        self.path = Path(path)
        if not self.path.is_absolute():
            raise StoreUnavailable()
        # Refuse accidental state under the application/public checkout.
        try:
            if self.path.resolve().is_relative_to(Path(__file__).resolve().parent):
                raise StoreUnavailable()
        except (OSError, ValueError, RuntimeError):
            raise StoreUnavailable() from None
        self.timeout = timeout

    @contextmanager
    def locked(self):
        fd = None
        try:
            if fcntl is None:
                raise StoreUnavailable()
            parent = self.path.parent.stat()
            if not stat.S_ISDIR(parent.st_mode) or parent.st_mode & 0o077:
                raise StoreUnavailable()
            fd = os.open(str(self.path) + '.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            if not stat.S_ISREG(os.fstat(fd).st_mode) or os.fstat(fd).st_mode & 0o077:
                raise StoreUnavailable()
            deadline = time.monotonic() + self.timeout
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise StoreUnavailable()
                    time.sleep(0.01)
            yield self
        except (OSError, ValueError, TypeError, OverflowError):
            raise StoreUnavailable() from None
        finally:
            if fd is not None:
                os.close(fd)  # Kernel releases the lock, including on process exit.

    def read(self):
        # Caller holds locked(); never read/cache state outside this boundary.
        try:
            fd = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'r', encoding='utf-8') as source:
                info = os.fstat(source.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 1024 * 1024:
                    raise StoreUnavailable()
                state = json.load(source)
            validate(state)
            return state
        except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
            raise StoreUnavailable() from None

    def write(self, state):
        validate(state)
        temporary = None
        try:
            fd, temporary = tempfile.mkstemp(prefix='.auth-', suffix='.tmp', dir=self.path.parent)
            with os.fdopen(fd, 'w', encoding='utf-8') as target:
                json.dump(state, target, separators=(',', ':'), allow_nan=False)
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary, self.path)
            temporary = None
            directory = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        except (OSError, ValueError, TypeError):
            raise StoreUnavailable() from None
        finally:
            if temporary is not None:
                try:
                    os.unlink(temporary)
                except OSError:
                    pass
