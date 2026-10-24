"""Run Alembic commands without the local ``backend/alembic`` path collision.

Usage from the backend directory:
    .venv\\Scripts\\python.exe scripts\\migrate.py upgrade
    .venv\\Scripts\\python.exe scripts\\migrate.py current

The script deliberately exposes only non-destructive migration operations.
Downgrades need a reviewed, explicit production procedure.
"""
import argparse
import os
import sys
from pathlib import Path


def _config():
    """Load Alembic before adding backend to import paths.

    When the command is run from ``backend/``, Python can resolve the local
    migrations directory named ``alembic`` before the installed package. By
    starting at the workspace root and setting Alembic's paths explicitly, the
    command behaves identically in development and CI.
    """
    backend_root = Path(__file__).resolve().parents[1]
    # Import Alembic from site-packages before changing into ``backend``. The
    # backend's own migrations directory has the same name as that package.
    from alembic.config import Config

    os.chdir(backend_root)
    # Alembic itself is already loaded from site-packages. Adding the backend
    # now makes ``app`` importable by alembic/env.py and lets Settings load the
    # backend .env file using the same behavior as the application process.
    backend_path = str(backend_root)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)

    config = Config("alembic.ini")
    config.set_main_option("script_location", "alembic")
    config.set_main_option("prepend_sys_path", ".")
    return config


def main() -> None:
    parser = argparse.ArgumentParser(description="G.E.M.S. migration runner")
    parser.add_argument("command", choices=("upgrade", "current", "heads"))
    args = parser.parse_args()

    from alembic import command

    config = _config()
    if args.command == "upgrade":
        command.upgrade(config, "head")
    elif args.command == "current":
        command.current(config, verbose=True)
    else:
        command.heads(config)


if __name__ == "__main__":
    main()
