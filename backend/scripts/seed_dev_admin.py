import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.domain.entities.user import User, UserRole
from src.infrastructure.ai.prompts.v2_full_analysis import (
    NAME as PROMPT_NAME,
    SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE,
    VERSION as PROMPT_VERSION,
)
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


DEFAULT_ADMIN_EMAIL = os.getenv("DEV_ADMIN_EMAIL", "admin@resume.ai")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEV_ADMIN_PASSWORD", "Admin123!")
DEFAULT_ADMIN_FULL_NAME = os.getenv("DEV_ADMIN_FULL_NAME", "Administrador Dev")


async def main() -> None:
    async with AsyncSessionFactory() as session:
        repository = SQLAlchemyUserRepository(session)
        existing_user = await repository.find_by_email(DEFAULT_ADMIN_EMAIL)
        user_id = None

        if existing_user is not None:
            print(f"Admin de desenvolvimento ja existe: {DEFAULT_ADMIN_EMAIL}")
            user_id = existing_user.id
        else:
            user = User.create(
                email=DEFAULT_ADMIN_EMAIL,
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                full_name=DEFAULT_ADMIN_FULL_NAME,
                role=UserRole.ADMIN,
            )
            user.verify_email()

            await repository.save(user)
            await session.flush()
            user_id = user.id
            print(f"Admin de desenvolvimento criado: {DEFAULT_ADMIN_EMAIL}")

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
                "template_type": "full_analysis",
                "version": PROMPT_VERSION,
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
                "name": PROMPT_NAME,
                "version": PROMPT_VERSION,
                "description": "Template padrao de analise de curriculos para ambiente de desenvolvimento",
                "template_type": "full_analysis",
                "system_prompt": SYSTEM_PROMPT,
                "user_prompt_template": USER_PROMPT_TEMPLATE,
                "max_tokens": 2048,
                "temperature": 0.1,
                "created_by": user_id,
            },
        )
        await session.commit()

    await engine.dispose()
    print(f"Prompt template padrao garantido: {PROMPT_NAME} v{PROMPT_VERSION}")


if __name__ == "__main__":
    asyncio.run(main())
