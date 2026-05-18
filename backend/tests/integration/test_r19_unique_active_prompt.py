"""R19 — At most one active prompt_template per template_type (DB-level).

Two layers protect this invariant:
1. `AIAdminService.activate_template` deactivates other templates of the same
   type before activating the new one (already implemented).
2. A unique partial index on (template_type) WHERE is_active = true blocks
   any bad direct write that bypasses the service.

This test pins layer 2.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import PromptTemplateModel


SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")


def _make_template(
    *,
    name: str,
    version: int,
    template_type: str,
    is_active: bool,
) -> PromptTemplateModel:
    return PromptTemplateModel(
        id=uuid4(),
        name=name,
        version=version,
        template_type=template_type,
        user_prompt_template="...",
        max_tokens=1000,
        temperature=0.1,
        is_active=is_active,
        created_by=SYSTEM_USER_ID,
        created_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_two_active_templates_of_same_type_are_rejected(
    db_session: AsyncSession,
) -> None:
    first = _make_template(
        name="full_analysis_v1",
        version=1,
        template_type="full_analysis",
        is_active=True,
    )
    db_session.add(first)
    await db_session.commit()

    second = _make_template(
        name="full_analysis_v2",
        version=2,
        template_type="full_analysis",
        is_active=True,
    )
    db_session.add(second)

    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_inactive_duplicates_are_allowed(
    db_session: AsyncSession,
) -> None:
    """Many INACTIVE rows for the same type are fine — the constraint only
    applies WHERE is_active = true."""
    db_session.add(_make_template(
        name="full_analysis_v1",
        version=1,
        template_type="full_analysis",
        is_active=False,
    ))
    db_session.add(_make_template(
        name="full_analysis_v2",
        version=2,
        template_type="full_analysis",
        is_active=False,
    ))
    db_session.add(_make_template(
        name="full_analysis_v3",
        version=3,
        template_type="full_analysis",
        is_active=True,
    ))
    await db_session.commit()  # must not raise


@pytest.mark.asyncio
async def test_different_template_types_can_each_have_one_active(
    db_session: AsyncSession,
) -> None:
    db_session.add(_make_template(
        name="full_analysis_v1",
        version=1,
        template_type="full_analysis",
        is_active=True,
    ))
    db_session.add(_make_template(
        name="resume_profiler_v1",
        version=1,
        template_type="resume_profiler",
        is_active=True,
    ))
    await db_session.commit()  # must not raise

    rows = (await db_session.execute(
        sa.select(PromptTemplateModel).where(PromptTemplateModel.is_active.is_(True))
    )).scalars().all()
    assert len(rows) == 2
    assert {r.template_type for r in rows} == {"full_analysis", "resume_profiler"}
