from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

load_dotenv(ROOT_DIR / ".env")

from src.core.settings import settings
from src.domain.entities.user import User, UserRole, UserStatus
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password

DEFAULT_EMAIL = os.getenv("DEV_ADMIN_EMAIL", "admin.local@example.test")
DEFAULT_PASSWORD = os.getenv("DEV_ADMIN_PASSWORD")
DEFAULT_FULL_NAME = os.getenv("DEV_ADMIN_FULL_NAME", "Admin RH Local")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cria ou reseta um usuario admin/HR local para validacao do dashboard."
    )
    parser.add_argument("--email", default=os.getenv("DEV_ADMIN_EMAIL", DEFAULT_EMAIL))
    parser.add_argument("--password", default=os.getenv("DEV_ADMIN_PASSWORD", DEFAULT_PASSWORD))
    parser.add_argument("--full-name", default=os.getenv("DEV_ADMIN_FULL_NAME", DEFAULT_FULL_NAME))
    parser.add_argument(
        "--role",
        default=os.getenv("DEV_ADMIN_ROLE", UserRole.ADMIN.value),
        choices=[UserRole.ADMIN.value, UserRole.HR.value],
    )
    return parser.parse_args()


def _assert_safe_environment() -> None:
    allowed = {"development", "test"}
    current = settings.APP_ENV.strip().lower()
    if current not in allowed:
        raise SystemExit(
            f"Recusado: script permitido apenas em development/test. APP_ENV atual: {settings.APP_ENV}"
        )


def _normalize_password(password: str | None) -> str:
    if not password or not password.strip():
        raise SystemExit("Informe a senha via --password ou DEV_ADMIN_PASSWORD.")
    return password


async def _upsert_user(*, email: str, password: str, full_name: str, role: UserRole) -> str:
    async with AsyncSessionFactory() as session:
        repository = SQLAlchemyUserRepository(session)
        existing_user = await repository.find_by_email(email)

        if existing_user is None:
            user = User.create(
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
                role=role,
                is_active=True,
                must_change_password=False,
            )
            await repository.save(user)
            await session.commit()
            return "created"

        existing_user.email = email.lower().strip()
        existing_user.full_name = full_name.strip()
        existing_user.role = role
        existing_user.status = UserStatus.ACTIVE
        existing_user.email_verified_at = existing_user.email_verified_at or datetime.now(UTC)
        existing_user.failed_login_count = 0
        existing_user.locked_until = None
        existing_user.set_password(
            hash_password(password),
            must_change_password=False,
        )
        await repository.save(existing_user)
        await session.commit()
        return "reset"


async def main() -> None:
    args = _parse_args()
    _assert_safe_environment()

    outcome = await _upsert_user(
        email=str(args.email).strip().lower(),
        password=_normalize_password(args.password),
        full_name=str(args.full_name).strip() or DEFAULT_FULL_NAME,
        role=UserRole(str(args.role)),
    )
    await engine.dispose()
    print(f"Usuario {outcome}: {str(args.email).strip().lower()}")


if __name__ == "__main__":
    asyncio.run(main())
