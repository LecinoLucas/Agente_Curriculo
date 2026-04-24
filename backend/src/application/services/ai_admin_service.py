from datetime import datetime, timezone
from uuid import UUID

from src.infrastructure.database.models.analysis_model import AIModelModel, PromptTemplateModel
from src.infrastructure.repositories.sqlalchemy_ai_repository import SQLAlchemyAIRepository
from src.interface.api.schemas.ai_schemas import (
    CreateAIModelRequest,
    CreatePromptTemplateRequest,
    PatchAIModelRequest,
    PatchPromptTemplateRequest,
)


class AIModelNotFoundError(Exception):
    pass


class AIModelConflictError(Exception):
    pass


class PromptTemplateNotFoundError(Exception):
    pass


class PromptTemplateConflictError(Exception):
    pass


class InvalidAIAdminTextError(Exception):
    pass


class AIAdminService:
    def __init__(self, repository: SQLAlchemyAIRepository) -> None:
        self._repository = repository

    async def create_model(self, body: CreateAIModelRequest) -> AIModelModel:
        model_id = self._clean_required_text(body.model_id)
        if await self._repository.find_model_by_api_id(model_id):
            raise AIModelConflictError

        now = datetime.now(timezone.utc)
        model = AIModelModel(
            provider=self._clean_required_text(body.provider),
            model_id=model_id,
            model_name=self._clean_required_text(body.model_name),
            context_window=body.context_window,
            is_active=body.is_active,
            activated_at=now,
            deprecated_at=None if body.is_active else now,
        )
        return await self._repository.create_model(model)

    async def list_models(self) -> list[AIModelModel]:
        return await self._repository.list_models()

    async def get_model(self, model_id: UUID) -> AIModelModel:
        model = await self._repository.find_model_by_id(model_id)
        if model is None:
            raise AIModelNotFoundError
        return model

    async def patch_model(self, model_id: UUID, body: PatchAIModelRequest) -> AIModelModel:
        model = await self.get_model(model_id)

        if body.model_id is not None:
            next_model_id = self._clean_required_text(body.model_id)
            conflict = await self._repository.find_model_by_api_id(next_model_id)
            if conflict is not None and conflict.id != model_id:
                raise AIModelConflictError
            model.model_id = next_model_id
        if body.provider is not None:
            model.provider = self._clean_required_text(body.provider)
        if body.model_name is not None:
            model.model_name = self._clean_required_text(body.model_name)
        if body.context_window is not None:
            model.context_window = body.context_window
        if body.is_active is not None:
            self._set_model_active(model, body.is_active)

        return await self._repository.save_model(model)

    async def list_templates(self) -> list[PromptTemplateModel]:
        return await self._repository.list_templates()

    async def get_template(self, template_id: UUID) -> PromptTemplateModel:
        template = await self._repository.find_template_by_id(template_id)
        if template is None:
            raise PromptTemplateNotFoundError
        return template

    async def create_template(self, body: CreatePromptTemplateRequest, created_by: UUID) -> PromptTemplateModel:
        name = self._clean_required_text(body.name)
        if await self._repository.find_template_by_name_version(name, body.version):
            raise PromptTemplateConflictError

        template = PromptTemplateModel(
            name=name,
            version=body.version,
            description=body.description,
            template_type=self._clean_required_text(body.template_type),
            system_prompt=body.system_prompt,
            user_prompt_template=self._clean_required_text(body.user_prompt_template),
            output_schema=body.output_schema,
            max_tokens=body.max_tokens,
            temperature=body.temperature,
            is_active=False,
            created_by=created_by,
        )
        return await self._repository.create_template(template)

    async def patch_template(self, template_id: UUID, body: PatchPromptTemplateRequest) -> PromptTemplateModel:
        template = await self.get_template(template_id)

        next_name = self._clean_required_text(body.name) if body.name is not None else template.name
        next_version = body.version if body.version is not None else template.version
        if next_name != template.name or next_version != template.version:
            conflict = await self._repository.find_template_by_name_version(next_name, next_version)
            if conflict is not None and conflict.id != template_id:
                raise PromptTemplateConflictError
            template.name = next_name
            template.version = next_version

        if body.description is not None:
            template.description = body.description
        if body.template_type is not None:
            template.template_type = self._clean_required_text(body.template_type)
        if body.system_prompt is not None:
            template.system_prompt = body.system_prompt
        if body.user_prompt_template is not None:
            template.user_prompt_template = self._clean_required_text(body.user_prompt_template)
        if body.output_schema is not None:
            template.output_schema = body.output_schema
        if body.max_tokens is not None:
            template.max_tokens = body.max_tokens
        if body.temperature is not None:
            template.temperature = body.temperature

        return await self._repository.save_template(template)

    async def activate_template(self, template_id: UUID) -> PromptTemplateModel:
        template = await self.get_template(template_id)
        now = datetime.now(timezone.utc)
        await self._repository.deactivate_templates_by_type_except(template.template_type, template.id, now)
        template.is_active = True
        template.activated_at = now
        template.deactivated_at = None
        return await self._repository.save_template(template)

    async def deactivate_template(self, template_id: UUID) -> PromptTemplateModel:
        template = await self.get_template(template_id)
        template.is_active = False
        template.deactivated_at = datetime.now(timezone.utc)
        return await self._repository.save_template(template)

    @staticmethod
    def _set_model_active(model: AIModelModel, is_active: bool) -> None:
        now = datetime.now(timezone.utc)
        model.is_active = is_active
        if is_active:
            model.activated_at = now
            model.deprecated_at = None
        else:
            model.deprecated_at = now

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidAIAdminTextError
        return cleaned
