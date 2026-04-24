from datetime import datetime, timezone
from uuid import UUID

from src.infrastructure.database.models.job_model import SkillModel
from src.infrastructure.repositories.sqlalchemy_skill_repository import SQLAlchemySkillRepository
from src.interface.api.schemas.skill_schemas import CreateSkillRequest, UpdateSkillRequest


class SkillNotFoundError(Exception):
    pass


class SkillNameConflictError(Exception):
    pass


class InvalidSkillTextError(Exception):
    pass


class SkillService:
    def __init__(self, repository: SQLAlchemySkillRepository) -> None:
        self._repository = repository

    async def create(self, body: CreateSkillRequest) -> SkillModel:
        name = self._clean_required_text(body.name)
        normalized = self._normalize(name)
        if await self._repository.find_active_by_normalized_name(normalized):
            raise SkillNameConflictError

        skill = SkillModel(
            name=name,
            normalized_name=normalized,
            category=body.category,
            aliases=self._clean_aliases(body.aliases),
            is_verified=False,
        )
        return await self._repository.create(skill)

    async def list(self, search: str | None, category: str | None, limit: int) -> list[SkillModel]:
        normalized_search = self._normalize(search) if search else None
        return await self._repository.list_active(normalized_search, category, limit)

    async def get(self, skill_id: UUID) -> SkillModel:
        skill = await self._repository.find_active_by_id(skill_id)
        if skill is None:
            raise SkillNotFoundError
        return skill

    async def update(self, skill_id: UUID, body: UpdateSkillRequest) -> SkillModel:
        skill = await self.get(skill_id)

        if body.name is not None:
            name = self._clean_required_text(body.name)
            normalized = self._normalize(name)
            conflict = await self._repository.find_active_by_normalized_name(normalized)
            if conflict is not None and conflict.id != skill_id:
                raise SkillNameConflictError
            skill.name = name
            skill.normalized_name = normalized

        if body.category is not None:
            skill.category = body.category
        if body.aliases is not None:
            skill.aliases = self._clean_aliases(body.aliases)
        if body.is_verified is not None:
            skill.is_verified = body.is_verified

        skill.updated_at = datetime.now(timezone.utc)
        return await self._repository.save(skill)

    async def soft_delete(self, skill_id: UUID) -> None:
        skill = await self.get(skill_id)
        now = datetime.now(timezone.utc)
        skill.deleted_at = now
        skill.updated_at = now
        await self._repository.save(skill)

    @staticmethod
    def _normalize(value: str) -> str:
        return value.lower().strip()

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidSkillTextError
        return cleaned

    @classmethod
    def _clean_aliases(cls, aliases: list[str]) -> list[str]:
        return sorted({cls._normalize(alias) for alias in aliases if alias.strip()})
