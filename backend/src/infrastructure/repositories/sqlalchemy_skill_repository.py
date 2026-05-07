from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.job_model import (
    SkillAliasModel,
    SkillEquivalenceModel,
    SkillModel,
)


class SQLAlchemySkillRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, skill: SkillModel) -> SkillModel:
        self._session.add(skill)
        await self._session.flush()
        await self._session.refresh(skill)
        return skill

    async def find_active_by_id(self, skill_id: UUID) -> SkillModel | None:
        return await self._session.scalar(
            sa.select(SkillModel).where(
                SkillModel.id == skill_id,
                SkillModel.deleted_at.is_(None),
            )
        )

    async def find_active_by_normalized_name(self, normalized_name: str) -> SkillModel | None:
        return await self._session.scalar(
            sa.select(SkillModel).where(
                SkillModel.normalized_name == normalized_name,
                SkillModel.deleted_at.is_(None),
            )
        )

    async def find_active_by_alias_normalized_name(self, alias_normalized: str) -> SkillModel | None:
        return await self._session.scalar(
            sa.select(SkillModel)
            .join(SkillAliasModel, SkillAliasModel.skill_id == SkillModel.id)
            .where(
                SkillAliasModel.alias_normalized == alias_normalized,
                SkillAliasModel.is_active.is_(True),
                SkillModel.deleted_at.is_(None),
            )
        )

    async def find_equivalence(
        self,
        source_skill_id: UUID,
        target_skill_id: UUID,
        context: str | None = None,
    ) -> SkillEquivalenceModel | None:
        conditions = [
            SkillEquivalenceModel.is_active.is_(True),
            sa.or_(
                sa.and_(
                    SkillEquivalenceModel.direction == "source_to_target",
                    SkillEquivalenceModel.source_skill_id == source_skill_id,
                    SkillEquivalenceModel.target_skill_id == target_skill_id,
                ),
                sa.and_(
                    SkillEquivalenceModel.direction == "bidirectional",
                    sa.or_(
                        sa.and_(
                            SkillEquivalenceModel.source_skill_id == source_skill_id,
                            SkillEquivalenceModel.target_skill_id == target_skill_id,
                        ),
                        sa.and_(
                            SkillEquivalenceModel.source_skill_id == target_skill_id,
                            SkillEquivalenceModel.target_skill_id == source_skill_id,
                        ),
                    ),
                ),
            ),
        ]

        if context is None:
            conditions.append(SkillEquivalenceModel.context.is_(None))
            order_by = [SkillEquivalenceModel.score.desc(), SkillEquivalenceModel.created_at.desc()]
        else:
            conditions.append(
                sa.or_(
                    SkillEquivalenceModel.context == context,
                    SkillEquivalenceModel.context.is_(None),
                )
            )
            order_by = [
                sa.case((SkillEquivalenceModel.context == context, 0), else_=1),
                SkillEquivalenceModel.score.desc(),
                SkillEquivalenceModel.created_at.desc(),
            ]

        return await self._session.scalar(
            sa.select(SkillEquivalenceModel)
            .where(*conditions)
            .order_by(*order_by)
        )

    async def list_active(
        self,
        search: str | None,
        category: str | None,
        limit: int,
    ) -> list[SkillModel]:
        filters = [SkillModel.deleted_at.is_(None)]
        if search:
            term = f"%{search}%"
            filters.append(
                sa.or_(
                    SkillModel.normalized_name.like(term),
                    sa.cast(SkillModel.aliases, sa.Text).like(term),
                )
            )
        if category:
            filters.append(sa.func.lower(SkillModel.category) == category.lower())

        result = await self._session.execute(
            sa.select(SkillModel)
            .where(*filters)
            .order_by(SkillModel.is_verified.desc(), SkillModel.name.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_all_active(self) -> list[SkillModel]:
        result = await self._session.execute(
            sa.select(SkillModel)
            .where(SkillModel.deleted_at.is_(None))
            .order_by(SkillModel.is_verified.desc(), SkillModel.name.asc())
        )
        return list(result.scalars().all())

    async def save(self, skill: SkillModel) -> SkillModel:
        await self._session.flush()
        await self._session.refresh(skill)
        return skill
