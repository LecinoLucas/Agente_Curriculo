from __future__ import annotations

import asyncio
import os
import secrets
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.domain.entities.user import User, UserRole
from src.infrastructure.ai.prompts.v2_full_analysis import (
    NAME as FULL_ANALYSIS_NAME,
    SYSTEM_PROMPT as FULL_ANALYSIS_SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE as FULL_ANALYSIS_USER_PROMPT_TEMPLATE,
    VERSION as FULL_ANALYSIS_VERSION,
)
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.repositories.sqlalchemy_user_repository import (
    SQLAlchemyUserRepository,
)
from src.infrastructure.security.password_service import hash_password


DEFAULT_ADMIN_EMAIL = os.getenv("DEV_ADMIN_EMAIL", "admin@resume.ai")
DEFAULT_ADMIN_FULL_NAME = os.getenv("DEV_ADMIN_FULL_NAME", "Administrador Dev")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEV_ADMIN_PASSWORD")


PROMPT_TEMPLATES = [
    {
        "name": FULL_ANALYSIS_NAME,
        "version": FULL_ANALYSIS_VERSION,
        "description": "Template padrão de análise completa de currículo.",
        "template_type": "full_analysis",
        "system_prompt": FULL_ANALYSIS_SYSTEM_PROMPT,
        "user_prompt_template": FULL_ANALYSIS_USER_PROMPT_TEMPLATE,
        "max_tokens": 2048,
        "temperature": 0.1,
    },
]


def _resolve_admin_password() -> tuple[str, bool]:
    if DEFAULT_ADMIN_PASSWORD:
        return DEFAULT_ADMIN_PASSWORD, False

    generated = secrets.token_urlsafe(16)
    return generated, True


async def _ensure_dev_admin(session) -> tuple[object, str | None]:
    repository = SQLAlchemyUserRepository(session)
    existing_user = await repository.find_by_email(DEFAULT_ADMIN_EMAIL)

    if existing_user is not None:
        print(f"Admin de desenvolvimento já existe: {DEFAULT_ADMIN_EMAIL}")
        return existing_user.id, None

    password, generated = _resolve_admin_password()

    user = User.create(
        email=DEFAULT_ADMIN_EMAIL,
        password_hash=hash_password(password),
        full_name=DEFAULT_ADMIN_FULL_NAME,
        role=UserRole.ADMIN,
    )
    user.verify_email()

    await repository.save(user)
    await session.flush()

    print(f"Admin de desenvolvimento criado: {DEFAULT_ADMIN_EMAIL}")

    if generated:
        print(f"Senha temporária gerada: {password}")
        print("Defina DEV_ADMIN_PASSWORD no .env se quiser senha fixa.")

    return user.id, password if generated else None


async def _upsert_prompt_template(
    session,
    *,
    template: dict,
    created_by,
) -> None:
    await session.execute(
        text(
            """
            UPDATE prompt_templates
            SET is_active = false,
                deactivated_at = NOW()
            WHERE template_type = :template_type
              AND is_active = true
              AND version <> :version
            """
        ),
        {
            "template_type": template["template_type"],
            "version": template["version"],
        },
    )

    await session.execute(
        text(
            """
            INSERT INTO prompt_templates (
                name,
                version,
                description,
                template_type,
                system_prompt,
                user_prompt_template,
                max_tokens,
                temperature,
                is_active,
                activated_at,
                created_by
            )
            VALUES (
                :name,
                :version,
                :description,
                :template_type,
                :system_prompt,
                :user_prompt_template,
                :max_tokens,
                :temperature,
                true,
                NOW(),
                :created_by
            )
            ON CONFLICT (name, version) DO UPDATE
            SET description = EXCLUDED.description,
                template_type = EXCLUDED.template_type,
                system_prompt = EXCLUDED.system_prompt,
                user_prompt_template = EXCLUDED.user_prompt_template,
                max_tokens = EXCLUDED.max_tokens,
                temperature = EXCLUDED.temperature,
                is_active = true,
                activated_at = NOW(),
                deactivated_at = NULL,
                created_by = EXCLUDED.created_by
            """
        ),
        {
            **template,
            "created_by": created_by,
        },
    )


async def main() -> None:
    async with AsyncSessionFactory() as session:
        user_id, _ = await _ensure_dev_admin(session)

        for template in PROMPT_TEMPLATES:
            await _upsert_prompt_template(
                session,
                template=template,
                created_by=user_id,
            )
            print(
                f"Prompt template garantido: "
                f"{template['name']} v{template['version']}"
            )

        await session.commit()

    await engine.dispose()
    print("Setup de desenvolvimento concluído.")


if __name__ == "__main__":
    asyncio.run(main())