"""Run privately: BAD_POINTAGE_AUTH_FILE=/absolute/private/auth-state.json python init_auth.py"""
import getpass
import os
import sys
from auth import initialize
from auth_store import StoreUnavailable


def main():
    if not sys.stdin.isatty():
        print('Initialisation refusée : terminal interactif requis.', file=sys.stderr)
        return 1
    try:
        code = getpass.getpass('Code responsable initial (12–256 caractères) : ')
        confirmation = getpass.getpass('Confirmer : ')
        if code != confirmation:
            print('Confirmation différente.', file=sys.stderr)
            return 1
        initialize(os.environ.get('BAD_POINTAGE_AUTH_FILE'), code)
    except (StoreUnavailable, ValueError):
        print('Initialisation refusée : vérifier configuration, permissions, code et absence d’état existant.', file=sys.stderr)
        return 1
    print('État privé initialisé.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
