from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.application.services.upload_validation_service import MIME_EXTENSIONS, document_upload_policy
from src.core.settings import settings
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionChecklistTemplateItemModel,
    PreAdmissionChecklistTemplateModel,
)
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import SQLAlchemyPreAdmissionRepository
from src.interface.api.schemas.pre_admission_schemas import (
    PreAdmissionChecklistTemplateCreateRequest,
    PreAdmissionChecklistTemplateDetailResponse,
    PreAdmissionChecklistTemplateItemCreateRequest,
    PreAdmissionChecklistTemplateItemResponse,
    PreAdmissionChecklistTemplateItemUpdateRequest,
    PreAdmissionChecklistTemplateResponse,
    PreAdmissionChecklistTemplateUpdateRequest,
)

_DEFAULT_ACCEPTED_FILE_TYPES = sorted(document_upload_policy().allowed_mime_types)
_MAX_FILE_SIZE_MB_LIMIT = settings.MAX_UPLOAD_SIZE_MB


class PreAdmissionChecklistTemplateService:
    def __init__(self, repository: SQLAlchemyPreAdmissionRepository) -> None:
        self._repository = repository

    async def list_templates(self) -> list[PreAdmissionChecklistTemplateResponse]:
        templates = await self._repository.list_checklist_templates()
        return [self._template_response(template) for template in templates]

    async def get_template(self, template_id: UUID) -> PreAdmissionChecklistTemplateDetailResponse:
        template = await self._required_template(template_id)
        return self._template_detail_response(template)

    async def create_template(
        self,
        *,
        body: PreAdmissionChecklistTemplateCreateRequest,
    ) -> PreAdmissionChecklistTemplateResponse:
        if body.is_default and not body.is_active:
            raise ValidationException("Checklist padrão precisa estar ativo.")

        now = datetime.now(UTC)
        template = PreAdmissionChecklistTemplateModel(
            name=body.name,
            description=body.description,
            admission_type=body.admission_type,
            is_active=body.is_active,
            is_default=body.is_default,
            created_at=now,
            updated_at=now,
        )
        if template.is_default:
            await self._repository.clear_default_checklist_templates()
        await self._repository.add_checklist_template(template)
        return PreAdmissionChecklistTemplateResponse(
            id=template.id,
            name=template.name,
            description=template.description,
            admission_type=template.admission_type,
            is_active=template.is_active,
            is_default=template.is_default,
            item_count=0,
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    async def update_template(
        self,
        *,
        template_id: UUID,
        body: PreAdmissionChecklistTemplateUpdateRequest,
    ) -> PreAdmissionChecklistTemplateResponse:
        template = await self._required_template(template_id)
        changed = False

        for field in ("name", "description", "admission_type", "is_active"):
            if field not in body.model_fields_set:
                continue
            next_value = getattr(body, field)
            if getattr(template, field) != next_value:
                setattr(template, field, next_value)
                changed = True

        if "is_default" in body.model_fields_set:
            next_default = bool(body.is_default)
            if next_default and not template.is_active:
                raise ValidationException("Checklist padrão precisa estar ativo.")
            if template.is_default != next_default:
                template.is_default = next_default
                changed = True

        if not template.is_active and template.is_default:
            template.is_default = False
            changed = True

        if not changed:
            return self._template_response(template)

        if template.is_default:
            await self._repository.clear_default_checklist_templates(exclude_template_id=template.id)

        template.updated_at = datetime.now(UTC)
        await self._repository.flush()
        return self._template_response(template)

    async def archive_template(self, *, template_id: UUID) -> PreAdmissionChecklistTemplateResponse:
        template = await self._required_template(template_id)
        if not template.is_active and not template.is_default:
            return self._template_response(template)

        template.is_active = False
        template.is_default = False
        template.updated_at = datetime.now(UTC)
        await self._repository.flush()
        return self._template_response(template)

    async def duplicate_template(self, *, template_id: UUID) -> PreAdmissionChecklistTemplateDetailResponse:
        template = await self._required_template(template_id)
        now = datetime.now(UTC)
        duplicated = PreAdmissionChecklistTemplateModel(
            name=self._duplicate_name(template.name),
            description=template.description,
            admission_type=template.admission_type,
            is_active=True,
            is_default=False,
            created_at=now,
            updated_at=now,
        )
        await self._repository.add_checklist_template(duplicated)

        active_items = await self._repository.list_active_checklist_template_items(template_id=template.id)
        for item in active_items:
            duplicated_item = PreAdmissionChecklistTemplateItemModel(
                template_id=duplicated.id,
                document_key=item.document_key,
                title=item.title,
                candidate_description=item.candidate_description,
                is_required=item.is_required,
                accepted_file_types=list(item.accepted_file_types or _DEFAULT_ACCEPTED_FILE_TYPES),
                max_file_size_mb=item.max_file_size_mb,
                display_order=item.display_order,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            await self._repository.add_checklist_template_item(duplicated_item)
        await self._repository.flush()
        refreshed = await self._required_template(duplicated.id)
        return self._template_detail_response(refreshed)

    async def create_item(
        self,
        *,
        template_id: UUID,
        body: PreAdmissionChecklistTemplateItemCreateRequest,
    ) -> PreAdmissionChecklistTemplateItemResponse:
        template = await self._required_template(template_id)
        now = datetime.now(UTC)
        item = PreAdmissionChecklistTemplateItemModel(
            template_id=template.id,
            document_key=body.document_key,
            title=body.title,
            candidate_description=body.candidate_description,
            is_required=body.is_required,
            accepted_file_types=self._clean_accepted_file_types(body.accepted_file_types),
            max_file_size_mb=self._clean_max_file_size_mb(body.max_file_size_mb),
            display_order=body.display_order if body.display_order is not None else self._next_display_order(template),
            is_active=body.is_active,
            created_at=now,
            updated_at=now,
        )
        await self._repository.add_checklist_template_item(item)
        return self._item_response(item)

    async def update_item(
        self,
        *,
        template_id: UUID,
        item_id: UUID,
        body: PreAdmissionChecklistTemplateItemUpdateRequest,
    ) -> PreAdmissionChecklistTemplateItemResponse:
        await self._required_template(template_id)
        item = await self._repository.get_checklist_template_item(template_id=template_id, item_id=item_id)
        if item is None:
            raise NotFoundException("Item do checklist não encontrado.")

        changed = False
        for field in ("document_key", "title", "candidate_description", "is_required", "display_order", "is_active"):
            if field not in body.model_fields_set:
                continue
            next_value = getattr(body, field)
            if getattr(item, field) != next_value:
                setattr(item, field, next_value)
                changed = True

        if "accepted_file_types" in body.model_fields_set:
            next_types = self._clean_accepted_file_types(body.accepted_file_types)
            if item.accepted_file_types != next_types:
                item.accepted_file_types = next_types
                changed = True

        if "max_file_size_mb" in body.model_fields_set:
            next_size = self._clean_max_file_size_mb(body.max_file_size_mb)
            if item.max_file_size_mb != next_size:
                item.max_file_size_mb = next_size
                changed = True

        if not changed:
            return self._item_response(item)

        item.updated_at = datetime.now(UTC)
        await self._repository.flush()
        return self._item_response(item)

    async def remove_item(self, *, template_id: UUID, item_id: UUID) -> None:
        await self._required_template(template_id)
        item = await self._repository.get_checklist_template_item(template_id=template_id, item_id=item_id)
        if item is None:
            raise NotFoundException("Item do checklist não encontrado.")
        if not item.is_active:
            return
        item.is_active = False
        item.updated_at = datetime.now(UTC)
        await self._repository.flush()

    async def resolve_template_for_case(self, *, template_id: UUID | None) -> PreAdmissionChecklistTemplateModel:
        if template_id is not None:
            template = await self._repository.get_active_checklist_template(template_id)
            if template is None:
                raise ValidationException("Checklist informado não está ativo.")
        else:
            template = await self._repository.get_default_active_checklist_template()
            if template is None:
                raise ValidationException("Nenhum checklist padrão ativo foi configurado para a pré-admissão.")

        if not self._active_template_items(template):
            raise ValidationException("O checklist selecionado não possui documentos ativos.")
        return template

    @staticmethod
    def _duplicate_name(name: str) -> str:
        suffix = " (Cópia)"
        base = name.strip()
        max_base_length = max(1, 180 - len(suffix))
        return f"{base[:max_base_length]}{suffix}"

    @staticmethod
    def _active_template_items(
        template: PreAdmissionChecklistTemplateModel,
    ) -> list[PreAdmissionChecklistTemplateItemModel]:
        return sorted(
            [item for item in template.items if item.is_active],
            key=lambda item: (item.display_order, item.created_at, item.id),
        )

    def _next_display_order(self, template: PreAdmissionChecklistTemplateModel) -> int:
        active_items = self._active_template_items(template)
        if not active_items:
            return 0
        return max(item.display_order for item in active_items) + 1

    def _clean_accepted_file_types(self, value: list[str] | None) -> list[str]:
        allowed_policy = document_upload_policy().allowed_mime_types
        if value is None:
            return list(_DEFAULT_ACCEPTED_FILE_TYPES)

        normalized = []
        for item in value:
            cleaned = (item or "").strip().lower()
            if not cleaned:
                continue
            if cleaned not in MIME_EXTENSIONS or cleaned not in allowed_policy:
                raise ValidationException("Tipo de arquivo não suportado para checklist.")
            normalized.append(cleaned)

        deduplicated = sorted(set(normalized))
        if not deduplicated:
            raise ValidationException("Informe ao menos um tipo de arquivo aceito.")
        return deduplicated

    @staticmethod
    def _clean_max_file_size_mb(value: int | None) -> int:
        if value is None:
            return _MAX_FILE_SIZE_MB_LIMIT
        if value < 1 or value > _MAX_FILE_SIZE_MB_LIMIT:
            raise ValidationException(
                f"Tamanho máximo do arquivo deve ficar entre 1MB e {_MAX_FILE_SIZE_MB_LIMIT}MB."
            )
        return value

    async def _required_template(self, template_id: UUID) -> PreAdmissionChecklistTemplateModel:
        template = await self._repository.get_checklist_template(template_id)
        if template is None:
            raise NotFoundException("Checklist de pré-admissão não encontrado.")
        return template

    @classmethod
    def _template_response(
        cls,
        template: PreAdmissionChecklistTemplateModel,
    ) -> PreAdmissionChecklistTemplateResponse:
        return PreAdmissionChecklistTemplateResponse(
            id=template.id,
            name=template.name,
            description=template.description,
            admission_type=template.admission_type,
            is_active=template.is_active,
            is_default=template.is_default,
            item_count=len(cls._active_template_items(template)),
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    @classmethod
    def _template_detail_response(
        cls,
        template: PreAdmissionChecklistTemplateModel,
    ) -> PreAdmissionChecklistTemplateDetailResponse:
        payload = cls._template_response(template).model_dump()
        return PreAdmissionChecklistTemplateDetailResponse(
            **payload,
            items=[cls._item_response(item) for item in cls._active_template_items(template)],
        )

    @staticmethod
    def _item_response(item: PreAdmissionChecklistTemplateItemModel) -> PreAdmissionChecklistTemplateItemResponse:
        return PreAdmissionChecklistTemplateItemResponse(
            id=item.id,
            template_id=item.template_id,
            document_key=item.document_key,
            title=item.title,
            candidate_description=item.candidate_description,
            is_required=item.is_required,
            accepted_file_types=list(item.accepted_file_types or []),
            max_file_size_mb=item.max_file_size_mb,
            display_order=item.display_order,
            is_active=item.is_active,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
