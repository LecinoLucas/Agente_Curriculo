from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import AIModelModel, PromptTemplateModel


class SQLAlchemyAIRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_model(self, model: AIModelModel) -> AIModelModel:
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return model

    async def list_models(self) -> list[AIModelModel]:
        result = await self._session.execute(
            sa.select(AIModelModel).order_by(AIModelModel.is_active.desc(), AIModelModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def find_model_by_id(self, model_id: UUID) -> AIModelModel | None:
        return await self._session.scalar(sa.select(AIModelModel).where(AIModelModel.id == model_id))

    async def find_model_by_api_id(self, model_id: str) -> AIModelModel | None:
        return await self._session.scalar(sa.select(AIModelModel).where(AIModelModel.model_id == model_id))

    async def save_model(self, model: AIModelModel) -> AIModelModel:
        await self._session.flush()
        await self._session.refresh(model)
        return model

    async def create_template(self, template: PromptTemplateModel) -> PromptTemplateModel:
        self._session.add(template)
        await self._session.flush()
        await self._session.refresh(template)
        return template

    async def list_templates(self) -> list[PromptTemplateModel]:
        result = await self._session.execute(
            sa.select(PromptTemplateModel).order_by(
                PromptTemplateModel.is_active.desc(),
                PromptTemplateModel.name.asc(),
                PromptTemplateModel.version.desc(),
            )
        )
        return list(result.scalars().all())

    async def find_template_by_id(self, template_id: UUID) -> PromptTemplateModel | None:
        return await self._session.scalar(sa.select(PromptTemplateModel).where(PromptTemplateModel.id == template_id))

    async def find_template_by_name_version(self, name: str, version: int) -> PromptTemplateModel | None:
        return await self._session.scalar(
            sa.select(PromptTemplateModel).where(
                PromptTemplateModel.name == name,
                PromptTemplateModel.version == version,
            )
        )

    async def deactivate_templates_by_type_except(self, template_type: str, template_id: UUID, deactivated_at) -> None:
        await self._session.execute(
            sa.update(PromptTemplateModel)
            .where(
                PromptTemplateModel.template_type == template_type,
                PromptTemplateModel.id != template_id,
                PromptTemplateModel.is_active.is_(True),
            )
            .values(is_active=False, deactivated_at=deactivated_at)
        )

    async def save_template(self, template: PromptTemplateModel) -> PromptTemplateModel:
        await self._session.flush()
        await self._session.refresh(template)
        return template
