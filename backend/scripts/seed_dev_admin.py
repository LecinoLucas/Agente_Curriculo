from __future__ import annotations

import asyncio
import os
import secrets
import sys
from pathlib import Path

import sqlalchemy as sa
from dotenv import load_dotenv
from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

load_dotenv(ROOT_DIR / ".env")

from src.domain.entities.user import User, UserRole
from src.infrastructure.ai.prompts.job_profiler import NAME as JOB_PROFILER_NAME
from src.infrastructure.ai.prompts.job_profiler import (
    SYSTEM_PROMPT as JOB_PROFILER_SYSTEM_PROMPT,
)
from src.infrastructure.ai.prompts.job_profiler import (
    USER_PROMPT_TEMPLATE as JOB_PROFILER_USER_PROMPT_TEMPLATE,
)
from src.infrastructure.ai.prompts.job_profiler import VERSION as JOB_PROFILER_VERSION
from src.infrastructure.ai.prompts.resume_profiler import NAME as RESUME_PROFILER_NAME
from src.infrastructure.ai.prompts.resume_profiler import (
    SYSTEM_PROMPT as RESUME_PROFILER_SYSTEM_PROMPT,
)
from src.infrastructure.ai.prompts.resume_profiler import (
    USER_PROMPT_TEMPLATE as RESUME_PROFILER_USER_PROMPT_TEMPLATE,
)
from src.infrastructure.ai.prompts.resume_profiler import VERSION as RESUME_PROFILER_VERSION
from src.infrastructure.database.models.analysis_model import PromptTemplateModel
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.repositories.sqlalchemy_user_repository import (
    SQLAlchemyUserRepository,
)
from src.infrastructure.security.password_service import hash_password, verify_password


DEFAULT_ADMIN_EMAIL = os.getenv("DEV_ADMIN_EMAIL", "admin@resume.ai")
DEFAULT_ADMIN_FULL_NAME = os.getenv("DEV_ADMIN_FULL_NAME", "Administrador Dev")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEV_ADMIN_PASSWORD")


PROMPT_TEMPLATES = [
    {
        "name": "full_analysis_default",
        "version": 1,
        "description": "Template padrão de análise completa de currículo.",
        "template_type": "full_analysis",
        "system_prompt": "Analyze resume against job context and return structured JSON.",
        "user_prompt_template": "Resume: {resume_text}\nJob context: {job_context}",
        "max_tokens": 2048,
        "temperature": 0.1,
    },
    {
        "name": JOB_PROFILER_NAME,
        "version": JOB_PROFILER_VERSION,
        "description": "Template de perfil estruturado de vaga.",
        "template_type": "job_profiler",
        "system_prompt": JOB_PROFILER_SYSTEM_PROMPT,
        "user_prompt_template": JOB_PROFILER_USER_PROMPT_TEMPLATE,
        "max_tokens": 2048,
        "temperature": 0.1,
    },
    {
        "name": RESUME_PROFILER_NAME,
        "version": RESUME_PROFILER_VERSION,
        "description": "Template de perfil estruturado de currículo.",
        "template_type": "resume_profiler",
        "system_prompt": RESUME_PROFILER_SYSTEM_PROMPT,
        "user_prompt_template": RESUME_PROFILER_USER_PROMPT_TEMPLATE,
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
        if DEFAULT_ADMIN_PASSWORD and not verify_password(
            DEFAULT_ADMIN_PASSWORD, existing_user.password_hash
        ):
            existing_user.set_password(
                hash_password(DEFAULT_ADMIN_PASSWORD),
                must_change_password=False,
            )
            await repository.save(existing_user)
            await session.flush()
            print("Senha do admin reconciliada com DEV_ADMIN_PASSWORD.")
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


async def _ensure_single_active_prompt_per_type(session) -> None:
    active_rows = await session.execute(
        sa.select(PromptTemplateModel.id, PromptTemplateModel.template_type)
        .where(PromptTemplateModel.is_active.is_(True))
        .order_by(
            PromptTemplateModel.template_type.asc(),
            PromptTemplateModel.version.desc(),
            PromptTemplateModel.created_at.desc(),
        )
    )
    active_by_type: dict[str, object] = {}
    for prompt_id, template_type in active_rows:
        key = str(template_type)
        if key not in active_by_type:
            active_by_type[key] = prompt_id
            continue
        await session.execute(
            text(
                """
                UPDATE prompt_templates
                SET is_active = false,
                    deactivated_at = NOW()
                WHERE id = :prompt_id
                """
            ),
            {"prompt_id": prompt_id},
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

        await _ensure_single_active_prompt_per_type(session)
        await session.commit()

    await engine.dispose()
    print("Setup de desenvolvimento concluído.")


if __name__ == "__main__":
    asyncio.run(main())
