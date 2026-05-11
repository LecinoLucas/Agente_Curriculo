from __future__ import annotations

import subprocess
from pathlib import Path

import pytest


pytestmark = [pytest.mark.postgres]


BACKEND_DIR = Path(__file__).resolve().parents[3]


@pytest.mark.postgres
def test_postgres_alembic_has_single_head(postgres_alembic_env: dict[str, str]) -> None:
    result = subprocess.run(
        ["./.venv/bin/alembic", "heads"],
        cwd=BACKEND_DIR,
        env=postgres_alembic_env,
        check=True,
        capture_output=True,
        text=True,
    )
    head_lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    assert len(head_lines) == 1
    assert "(head)" in head_lines[0]


@pytest.mark.postgres
def test_postgres_alembic_upgrade_head_is_clean(postgres_alembic_env: dict[str, str]) -> None:
    result = subprocess.run(
        ["./.venv/bin/alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=postgres_alembic_env,
        check=True,
        capture_output=True,
        text=True,
    )
    combined_output = f"{result.stdout}\n{result.stderr}"
    assert "Running upgrade" not in combined_output
