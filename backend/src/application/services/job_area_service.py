from datetime import UTC, datetime
from typing import Any, Optional, Sequence
from uuid import UUID

from src.application.services.audit_service import AuditService
from src.application.services.job_area_normalizer import normalize_job_area_name
from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.job_area_model import JobAreaModel
from src.infrastructure.repositories.sqlalchemy_job_area_repository import SQLAlchemyJobAreaRepository


class JobAreaService:
    def __init__(
        self,
        repository: SQLAlchemyJobAreaRepository,
        audit_service: AuditService | None = None,
    ):
        self._repository = repository
        self._audit_service = audit_service

    async def list_areas(
        self,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        is_active: Optional[bool] = True,
    ) -> tuple[Sequence[JobAreaModel], int]:
        return await self._repository.list_areas(
            page=page,
            page_size=page_size,
            search=search,
            is_active=is_active,
        )

    async def create_area(
        self,
        name: str,
        description: Optional[str] = None,
        created_by: Optional[UUID] = None,
    ) -> JobAreaModel:
        # Validate name
        if not name:
            raise ValidationException("O nome da área é obrigatório.")

        try:
            normalized_name = normalize_job_area_name(name)
        except ValueError as e:
            raise ValidationException(str(e))

        # Check if name exists
        existing_area = await self._repository.find_by_normalized_name(normalized_name)
        if existing_area:
            raise ConflictException(f"Já existe uma área com o nome '{name}'.")

        # Create model
        area_model = JobAreaModel(
            name=name.strip(),
            normalized_name=normalized_name,
            description=description,
            created_by=created_by,
            updated_by=created_by,
        )

        area = await self._repository.create_area(area_model)
        await self._log_audit(
            action="create_job_area",
            area=area,
            user_id=created_by,
            before_state=None,
            after_state=self._audit_snapshot(area),
        )
        return area

    async def update_area(
        self,
        area_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_active: Optional[bool] = None,
        updated_by: Optional[UUID] = None,
    ) -> JobAreaModel:
        area = await self._repository.find_by_id(area_id)
        if not area:
            raise NotFoundException("Área não encontrada.")
        before_state = self._audit_snapshot(area)

        if name is not None:
            if not name:
                raise ValidationException("O nome da área não pode ser vazio.")
            try:
                normalized_name = normalize_job_area_name(name)
            except ValueError as e:
                raise ValidationException(str(e))

            if normalized_name != area.normalized_name:
                existing_area = await self._repository.find_by_normalized_name(normalized_name)
                if existing_area:
                    raise ConflictException(f"Já existe uma área com o nome '{name}'.")
                area.name = name.strip()
                area.normalized_name = normalized_name

        if description is not None:
            area.description = description

        if is_active is not None:
            area.is_active = is_active

        if updated_by is not None:
            area.updated_by = updated_by

        updated = await self._repository.update_area(area)
        await self._log_audit(
            action="update_job_area",
            area=updated,
            user_id=updated_by,
            before_state=before_state,
            after_state=self._audit_snapshot(updated),
        )
        return updated

    async def activate_area(self, area_id: UUID, updated_by: Optional[UUID] = None) -> JobAreaModel:
        area = await self._repository.find_by_id(area_id)
        if not area:
            raise NotFoundException("Área não encontrada.")
        before_state = self._audit_snapshot(area)
        area.updated_by = updated_by
        updated = await self._repository.activate_area(area)
        await self._log_audit(
            action="activate_job_area",
            area=updated,
            user_id=updated_by,
            before_state=before_state,
            after_state=self._audit_snapshot(updated),
        )
        return updated

    async def deactivate_area(self, area_id: UUID, updated_by: Optional[UUID] = None) -> JobAreaModel:
        area = await self._repository.find_by_id(area_id)
        if not area:
            raise NotFoundException("Área não encontrada.")
        before_state = self._audit_snapshot(area)
        area.updated_by = updated_by
        updated = await self._repository.deactivate_area(area)
        await self._log_audit(
            action="deactivate_job_area",
            area=updated,
            user_id=updated_by,
            before_state=before_state,
            after_state=self._audit_snapshot(updated),
        )
        return updated

    async def delete_area(self, area_id: UUID, current_user: Any) -> None:
        # 1. Verificar se a área existe
        area = await self._repository.find_by_id(area_id)
        if not area:
            raise NotFoundException("Área não encontrada.")

        # 2. Verificar se existe vaga usando essa área
        count = await self._repository.count_jobs_using_area(area.name)
        if count > 0:
            raise ConflictException("Esta área está sendo usada em uma ou mais vagas. Inative a área em vez de excluí-la.")

        # 3. Excluir fisicamente
        await self._repository.delete_area(area_id)

        # 4. Registrar auditoria
        if self._audit_service and hasattr(current_user, "id"):
            try:
                await self._audit_service.log_event(
                    action="delete_job_area",
                    resource_type="job_area",
                    resource_id=area_id,
                    user_id=current_user.id,
                    metadata={
                        "area_name": area.name,
                    },
                    before_state=self._audit_snapshot(area),
                )
            except Exception:
                # Não quebrar a operação se a auditoria falhar
                pass

    @staticmethod
    def _audit_snapshot(area: JobAreaModel) -> dict[str, object]:
        return {
            "name": area.name,
            "description": area.description,
            "is_active": area.is_active,
            "updated_at": area.updated_at.isoformat() if area.updated_at else None,
        }

    async def _log_audit(
        self,
        *,
        action: str,
        area: JobAreaModel,
        user_id: UUID | None,
        before_state: dict[str, object] | None,
        after_state: dict[str, object] | None,
    ) -> None:
        if self._audit_service is None or user_id is None:
            return
        try:
            await self._audit_service.log_event(
                action=action,
                resource_type="job_area",
                resource_id=area.id,
                user_id=user_id,
                metadata={
                    "area_name": area.name,
                    "name": area.name,
                    "description": area.description,
                    "next_state": "active" if area.is_active else "inactive",
                    "timestamp": datetime.now(UTC).isoformat(),
                },
                before_state=before_state,
                after_state=after_state,
            )
        except Exception:
            pass
