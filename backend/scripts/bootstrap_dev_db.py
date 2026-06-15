"""DEPRECIADO — não use este script.

Use sempre o bootstrap oficial:
    python scripts/bootstrap_dev.py

bootstrap_dev_db.py não insere o template ativo full_analysis nem aplica
as proteções de ambiente contra banco de produção. Banco bootstrapeado por
este script ficará incompleto e causará:

    ValidationException("Nenhum template ativo para tipo 'full_analysis'")

na primeira criação de análise IA.
"""
from __future__ import annotations

import sys

print(
    "\n[ERRO] bootstrap_dev_db.py é legado e não deve ser usado.\n"
    "\n"
    "       Use o bootstrap oficial:\n"
    "\n"
    "           python scripts/bootstrap_dev.py\n"
    "\n"
    "       Este script não insere o template ativo full_analysis e não\n"
    "       tem proteções de ambiente contra banco de produção.\n"
    "       Banco criado por este script causará erro na análise IA.\n",
    file=sys.stderr,
)
sys.exit(1)


def main() -> None:
    # Nunca executado — sys.exit(1) acima garante o abort.
    raise RuntimeError("bootstrap_dev_db.py está depreciado. Use bootstrap_dev.py.")


if __name__ == "__main__":
    main()
