"""Overrides locais para tests/unit/.

Motivo: o `tests/conftest.py` raiz declara um fixture autouse
`system_user_for_public_app` que depende de `db_session`. Esse fixture cria
um UserModel no SQLite em memória para que integration tests do public
application possam usar `created_by=SYSTEM_USER_ID` sem FK error.

Para tests/unit/ esse fixture é puro custo morto (≈250 ms por teste a
inicializar tabelas + executar `_clear_database` antes e depois). Como
unit tests não dependem de DB nem do system user, override aqui para
no-op zera esse overhead.

Os 2 unit tests que de fato exercitam DB (test_candidate_resume_count.py
e test_user_preferences.py) requisitam `db_session` explicitamente —
esses continuam funcionando porque o fixture `db_session` segue disponível
do conftest raiz; apenas o autouse foi neutralizado.
"""
from __future__ import annotations

import pytest_asyncio


@pytest_asyncio.fixture(autouse=True)
async def system_user_for_public_app():
    """No-op override do autouse do conftest raiz; sem dependência de db_session."""
    yield None
