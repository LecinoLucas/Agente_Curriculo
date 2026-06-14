from typing import Optional, Sequence
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.infrastructure.database.models.skill_catalog_model import (
    SkillAliasModel,
    SkillCatalogModel,
    SkillRelationModel,
)
from src.application.services.skill_catalog_normalizer import normalize_skill_name

class SQLAlchemySkillCatalogRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def find_by_id(self, skill_id: UUID) -> Optional[SkillCatalogModel]:
        stmt = (
            sa.select(SkillCatalogModel)
            .options(
                selectinload(SkillCatalogModel.aliases),
                selectinload(SkillCatalogModel.outgoing_relations).selectinload(
                    SkillRelationModel.target_skill
                ),
            )
            .where(SkillCatalogModel.id == skill_id)
        )
        result = await self._session.execute(stmt)
        return result.scalars().first()

    async def find_by_normalized_name(self, normalized_name: str) -> Optional[SkillCatalogModel]:
        stmt = (
            sa.select(SkillCatalogModel)
            .options(
                selectinload(SkillCatalogModel.aliases),
                selectinload(SkillCatalogModel.outgoing_relations).selectinload(
                    SkillRelationModel.target_skill
                ),
            )
            .where(SkillCatalogModel.normalized_name == normalized_name)
        )
        result = await self._session.execute(stmt)
        return result.scalars().first()

    async def find_by_normalized_alias(self, normalized_alias: str) -> Optional[SkillAliasModel]:
        stmt = (
            sa.select(SkillAliasModel)
            .options(selectinload(SkillAliasModel.skill))
            .where(SkillAliasModel.normalized_alias == normalized_alias)
        )
        result = await self._session.execute(stmt)
        return result.scalars().first()

    async def list_skills_by_normalized_names(
        self,
        normalized_names: Sequence[str],
        *,
        exclude_skill_id: UUID | None = None,
    ) -> Sequence[SkillCatalogModel]:
        if not normalized_names:
            return []

        stmt = (
            sa.select(SkillCatalogModel)
            .options(selectinload(SkillCatalogModel.aliases))
            .where(SkillCatalogModel.normalized_name.in_(tuple(normalized_names)))
        )
        if exclude_skill_id is not None:
            stmt = stmt.where(SkillCatalogModel.id != exclude_skill_id)

        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def list_aliases_by_normalized_values(
        self,
        normalized_aliases: Sequence[str],
        *,
        exclude_skill_id: UUID | None = None,
    ) -> Sequence[SkillAliasModel]:
        if not normalized_aliases:
            return []

        stmt = (
            sa.select(SkillAliasModel)
            .options(selectinload(SkillAliasModel.skill))
            .where(SkillAliasModel.normalized_alias.in_(tuple(normalized_aliases)))
        )
        if exclude_skill_id is not None:
            stmt = stmt.where(SkillAliasModel.skill_id != exclude_skill_id)

        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def list_skills(
        self,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        category: Optional[str] = None,
        catalog_type: Optional[str] = None,
        is_active: Optional[bool] = None,
        archived: bool = False,
    ) -> tuple[Sequence[SkillCatalogModel], int]:
        stmt = sa.select(SkillCatalogModel).options(
            selectinload(SkillCatalogModel.aliases),
            selectinload(SkillCatalogModel.outgoing_relations).selectinload(
                SkillRelationModel.target_skill
            ),
        )

        if archived:
            stmt = stmt.where(SkillCatalogModel.archived_at.is_not(None))
        else:
            stmt = stmt.where(SkillCatalogModel.archived_at.is_(None))

        if is_active is not None:
            stmt = stmt.where(SkillCatalogModel.is_active == is_active)

        if category:
            stmt = stmt.where(SkillCatalogModel.category == category)

        if catalog_type:
            stmt = stmt.where(SkillCatalogModel.catalog_type == catalog_type)

        if search:
            normalized_search = normalize_skill_name(search)
            search_pattern = f"%{normalized_search}%"

            stmt = stmt.outerjoin(SkillAliasModel)

            stmt = stmt.where(
                sa.or_(
                    SkillCatalogModel.normalized_name.ilike(search_pattern),
                    SkillAliasModel.normalized_alias.ilike(search_pattern)
                )
            ).distinct()

        # Count total
        count_stmt = sa.select(sa.func.count()).select_from(stmt.subquery())
        total_result = await self._session.execute(count_stmt)
        total = total_result.scalar() or 0

        # Pagination
        stmt = stmt.order_by(SkillCatalogModel.normalized_name.asc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self._session.execute(stmt)
        return result.scalars().all(), total

    async def list_runtime_skills(
        self,
        *,
        include_inactive: bool = False,
    ) -> Sequence[SkillCatalogModel]:
        stmt = (
            sa.select(SkillCatalogModel)
            .options(
                selectinload(SkillCatalogModel.aliases),
                selectinload(SkillCatalogModel.outgoing_relations).selectinload(
                    SkillRelationModel.target_skill
                ),
            )
            .where(SkillCatalogModel.archived_at.is_(None))
            .order_by(SkillCatalogModel.normalized_name.asc())
        )
        if not include_inactive:
            stmt = stmt.where(SkillCatalogModel.is_active.is_(True))

        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def list_runtime_relations(self) -> Sequence[SkillRelationModel]:
        stmt = (
            sa.select(SkillRelationModel)
            .options(
                selectinload(SkillRelationModel.source_skill),
                selectinload(SkillRelationModel.target_skill),
            )
            .order_by(
                SkillRelationModel.normalized_source_name.asc(),
                SkillRelationModel.normalized_target_name.asc(),
                SkillRelationModel.relation_type.asc().nullsfirst(),
            )
        )
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def find_relation(
        self,
        *,
        normalized_source_name: str,
        normalized_target_name: str,
        relation_type: str | None = None,
    ) -> Optional[SkillRelationModel]:
        stmt = sa.select(SkillRelationModel).where(
            SkillRelationModel.normalized_source_name == normalized_source_name,
            SkillRelationModel.normalized_target_name == normalized_target_name,
        )
        if relation_type is None:
            stmt = stmt.where(SkillRelationModel.relation_type.is_(None))
        else:
            stmt = stmt.where(SkillRelationModel.relation_type == relation_type)
        result = await self._session.execute(stmt)
        return result.scalars().first()

    async def create_relation(self, relation: SkillRelationModel) -> SkillRelationModel:
        self._session.add(relation)
        await self._session.flush()
        await self._session.refresh(relation)
        return relation

    async def update_relation(self, relation: SkillRelationModel) -> SkillRelationModel:
        await self._session.flush()
        await self._session.refresh(relation)
        return relation

    async def reassign_alias(
        self,
        alias: SkillAliasModel,
        skill: SkillCatalogModel,
    ) -> SkillAliasModel:
        alias.skill_id = skill.id
        alias.skill = skill
        await self._session.flush()
        await self._session.refresh(alias, ["skill"])
        return alias

    async def create_skill_with_aliases(
        self,
        skill: SkillCatalogModel,
        aliases: list[SkillAliasModel]
    ) -> SkillCatalogModel:
        self._session.add(skill)
        await self._session.flush()

        for alias in aliases:
            alias.skill_id = skill.id
            self._session.add(alias)

        await self._session.flush()
        await self._session.refresh(skill, ["aliases", "outgoing_relations"])
        return skill

    async def update_skill(self, skill: SkillCatalogModel) -> SkillCatalogModel:
        await self._session.flush()
        await self._session.refresh(skill, ["aliases", "outgoing_relations"])
        return skill

    async def delete_skill(self, skill: SkillCatalogModel) -> None:
        await self._session.delete(skill)
        await self._session.flush()

    async def replace_aliases(
        self,
        skill: SkillCatalogModel,
        aliases: list[SkillAliasModel],
    ) -> SkillCatalogModel:
        skill.aliases.clear()
        await self._session.flush()

        for alias in aliases:
            alias.skill_id = skill.id
            self._session.add(alias)

        await self._session.flush()
        await self._session.refresh(skill, ["aliases", "outgoing_relations"])
        return skill
