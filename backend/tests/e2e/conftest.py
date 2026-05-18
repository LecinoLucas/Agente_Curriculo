"""Marca automaticamente todos os testes em tests/e2e/ com os markers
`e2e` e `slow` — não precisa repetir `pytestmark` em cada arquivo.

Permite executar:
    pytest -m "not e2e"          # smoke sem cenários longos
    pytest -m "e2e"              # apenas e2e
    pytest tests/e2e/            # explicitamente
"""
from __future__ import annotations

import pytest


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    for item in items:
        # `nodeid` começa em "tests/e2e/..." para qualquer teste deste pacote.
        if "tests/e2e/" in item.nodeid:
            item.add_marker(pytest.mark.e2e)
            item.add_marker(pytest.mark.slow)
