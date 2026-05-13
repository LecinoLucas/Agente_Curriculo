from datetime import datetime, timezone
from typing import Optional, Sequence
from uuid import UUID

import structlog

from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.skill_catalog_model import SkillAliasModel, SkillCatalogModel
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import SQLAlchemySkillCatalogRepository
from src.application.services.skill_catalog_normalizer import normalize_skill_name
from src.application.services.audit_service import AuditService

logger = structlog.get_logger(__name__)

class SkillCatalogService:
    def __init__(
        self,
        repository: SQLAlchemySkillCatalogRepository,
        audit_service: AuditService | None = None,
    ):
        self._repository = repository
        self._audit_service = audit_service

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
        return await self._repository.list_skills(
            page=page,
            page_size=page_size,
            search=search,
            category=category,
            catalog_type=catalog_type,
            is_active=is_active,
            archived=archived,
        )

    async def create_skill(
        self,
        name: str,
        category: Optional[str] = None,
        description: Optional[str] = None,
        aliases: Optional[list[str]] = None,
        created_by: Optional[UUID] = None,
    ) -> SkillCatalogModel:
        normalized_name = await self._validate_skill_name(name)
        processed_aliases = await self._build_alias_models(
            normalized_name=normalized_name,
            aliases=aliases,
        )

        skill_model = SkillCatalogModel(
            name=name.strip(),
            normalized_name=normalized_name,
            category=category,
            description=description,
            created_by=created_by,
            updated_by=created_by,
        )

        saved = await self._repository.create_skill_with_aliases(skill_model, processed_aliases)
        await self._log_audit(
            action="create_skill",
            skill=saved,
            user_id=created_by,
            previous_state=None,
            next_state=self._state_label(saved),
        )
        return saved

    async def update_skill(
        self,
        skill_id: UUID,
        *,
        name: Optional[str] = None,
        category: Optional[str] = None,
        description: Optional[str] = None,
        aliases: Optional[list[str]] = None,
        updated_by: Optional[UUID] = None,
    ) -> SkillCatalogModel:
        skill = await self._get_skill(skill_id)
        previous_state = self._state_label(skill)
        before_payload = self._audit_snapshot(skill)

        if name is not None:
            normalized_name = await self._validate_skill_name(name, current_skill_id=skill.id)
            skill.name = name.strip()
            skill.normalized_name = normalized_name

        if category is not None:
            skill.category = category or None

        if description is not None:
            skill.description = description or None

        if aliases is not None:
            normalized_name = skill.normalized_name
            processed_aliases = await self._build_alias_models(
                normalized_name=normalized_name,
                aliases=aliases,
                current_skill_id=skill.id,
            )
            skill = await self._repository.replace_aliases(skill, processed_aliases)

        skill.updated_by = updated_by
        skill.updated_at = datetime.now(timezone.utc)

        saved = await self._repository.update_skill(skill)
        await self._log_audit(
            action="update_skill",
            skill=saved,
            user_id=updated_by,
            previous_state=previous_state,
            next_state=self._state_label(saved),
            before_state=before_payload,
        )
        return saved

    async def deactivate_skill(
        self,
        skill_id: UUID,
        *,
        updated_by: Optional[UUID] = None,
    ) -> SkillCatalogModel:
        skill = await self._get_skill(skill_id)
        previous_state = self._state_label(skill)
        skill.is_active = False
        skill.updated_by = updated_by
        skill.updated_at = datetime.now(timezone.utc)
        saved = await self._repository.update_skill(skill)
        await self._log_audit(
            action="deactivate_skill",
            skill=saved,
            user_id=updated_by,
            previous_state=previous_state,
            next_state=self._state_label(saved),
        )
        return saved

    async def activate_skill(
        self,
        skill_id: UUID,
        *,
        updated_by: Optional[UUID] = None,
    ) -> SkillCatalogModel:
        skill = await self._get_skill(skill_id)
        previous_state = self._state_label(skill)
        skill.is_active = True
        skill.archived_at = None
        skill.archived_by = None
        skill.archive_reason = None
        skill.archive_reason_note = None
        skill.updated_by = updated_by
        skill.updated_at = datetime.now(timezone.utc)
        saved = await self._repository.update_skill(skill)
        await self._log_audit(
            action="activate_skill",
            skill=saved,
            user_id=updated_by,
            previous_state=previous_state,
            next_state=self._state_label(saved),
        )
        return saved

    async def archive_skill(
        self,
        skill_id: UUID,
        *,
        updated_by: Optional[UUID] = None,
        reason: str,
        note: Optional[str] = None,
    ) -> SkillCatalogModel:
        skill = await self._get_skill(skill_id)
        if skill.archived_at is not None:
            raise ValidationException("A skill já está arquivada.")
        if skill.is_active:
            raise ConflictException("Inative a skill antes de arquivar.")

        previous_state = self._state_label(skill)
        now = datetime.now(timezone.utc)
        skill.is_active = False
        skill.archived_at = now
        skill.archived_by = updated_by
        skill.archive_reason = reason.strip()
        skill.archive_reason_note = self._clean_optional_text(note)
        skill.updated_by = updated_by
        skill.updated_at = now
        saved = await self._repository.update_skill(skill)
        await self._log_audit(
            action="archive_skill",
            skill=saved,
            user_id=updated_by,
            previous_state=previous_state,
            next_state=self._state_label(saved),
            reason=skill.archive_reason,
            note=skill.archive_reason_note,
        )
        return saved

    async def restore_skill(
        self,
        skill_id: UUID,
        *,
        updated_by: Optional[UUID] = None,
    ) -> SkillCatalogModel:
        skill = await self._get_skill(skill_id)
        if skill.archived_at is None:
            raise ValidationException("A skill não está arquivada.")

        previous_state = self._state_label(skill)
        skill.archived_at = None
        skill.archived_by = None
        skill.archive_reason = None
        skill.archive_reason_note = None
        skill.is_active = False
        skill.updated_by = updated_by
        skill.updated_at = datetime.now(timezone.utc)
        saved = await self._repository.update_skill(skill)
        await self._log_audit(
            action="restore_skill",
            skill=saved,
            user_id=updated_by,
            previous_state=previous_state,
            next_state=self._state_label(saved),
        )
        return saved

    async def _get_skill(self, skill_id: UUID) -> SkillCatalogModel:
        skill = await self._repository.find_by_id(skill_id)
        if skill is None:
            raise NotFoundException("Skill não encontrada.")
        return skill

    async def _validate_skill_name(
        self,
        name: str,
        current_skill_id: UUID | None = None,
    ) -> str:
        if not name:
            raise ValidationException("O nome da skill é obrigatório.")

        normalized_name = normalize_skill_name(name)
        if not normalized_name:
            raise ValidationException("O nome da skill não pode ser vazio ou apenas espaços.")

        existing_skill = await self._repository.find_by_normalized_name(normalized_name)
        if existing_skill and existing_skill.id != current_skill_id:
            raise ConflictException(f"Já existe uma skill com o nome '{name.strip()}'.")

        existing_alias = await self._repository.find_by_normalized_alias(normalized_name)
        if existing_alias and existing_alias.skill_id != current_skill_id:
            raise ConflictException(f"O nome '{name.strip()}' já existe como alias para outra skill.")

        return normalized_name

    async def _build_alias_models(
        self,
        *,
        normalized_name: str,
        aliases: Optional[list[str]],
        current_skill_id: UUID | None = None,
    ) -> list[SkillAliasModel]:
        processed_aliases: list[SkillAliasModel] = []
        normalized_aliases_set: set[str] = set()

        for alias_name in aliases or []:
            norm_alias = normalize_skill_name(alias_name)
            if not norm_alias:
                continue

            if norm_alias in normalized_aliases_set:
                raise ValidationException(f"O alias '{norm_alias}' está duplicado na requisição.")

            if norm_alias == normalized_name:
                raise ValidationException(f"O alias '{norm_alias}' não pode ser igual ao nome da skill.")

            conflict_skill = await self._repository.find_by_normalized_name(norm_alias)
            if conflict_skill and conflict_skill.id != current_skill_id:
                raise ConflictException(f"O alias '{norm_alias}' já existe como uma skill principal.")

            conflict_alias = await self._repository.find_by_normalized_alias(norm_alias)
            if conflict_alias and conflict_alias.skill_id != current_skill_id:
                raise ConflictException(f"O alias '{norm_alias}' já está cadastrado para outra skill.")

            normalized_aliases_set.add(norm_alias)
            processed_aliases.append(
                SkillAliasModel(
                    alias=alias_name.strip(),
                    normalized_alias=norm_alias,
                )
            )

        return processed_aliases

    def _clean_optional_text(self, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    def _state_label(self, skill: SkillCatalogModel) -> str:
        if skill.archived_at is not None:
            return "archived"
        return "active" if skill.is_active else "inactive"

    def _audit_snapshot(self, skill: SkillCatalogModel) -> dict[str, object]:
        return {
            "name": skill.name,
            "category": skill.category,
            "aliases_count": len(skill.aliases),
            "state": self._state_label(skill),
        }

    async def _log_audit(
        self,
        *,
        action: str,
        skill: SkillCatalogModel,
        user_id: UUID | None,
        previous_state: str | None,
        next_state: str,
        reason: str | None = None,
        note: str | None = None,
        before_state: dict[str, object] | None = None,
    ) -> None:
        if self._audit_service is None or user_id is None:
            return

        try:
            await self._audit_service.log_event(
                action=action,
                resource_type="skill_catalog",
                resource_id=skill.id,
                user_id=user_id,
                metadata={
                    "skill_name": skill.name,
                    "category": skill.category,
                    "aliases_count": len(skill.aliases),
                    "previous_state": previous_state,
                    "next_state": next_state,
                    "reason": reason,
                    "note": note,
                },
                before_state=before_state,
                after_state=self._audit_snapshot(skill),
            )
        except Exception:
            logger.warning(
                "skill_catalog.audit_log_failed",
                action=action,
                skill_id=str(skill.id),
                user_id=str(user_id),
                exc_info=True,
            )
