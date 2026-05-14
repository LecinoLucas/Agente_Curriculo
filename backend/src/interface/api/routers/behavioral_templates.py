from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.behavioral_template_service import BehavioralTemplateService
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.repositories.sqlalchemy_behavioral_template_repository import (
    SQLAlchemyBehavioralTemplateRepository,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.behavioral_template_schemas import (
    BehavioralCompetencyCreateRequest,
    BehavioralCompetencyResponse,
    BehavioralCompetencyUpdateRequest,
    BehavioralQuestionCreateRequest,
    BehavioralQuestionResponse,
    BehavioralQuestionUpdateRequest,
    BehavioralTemplateCreateRequest,
    BehavioralTemplateDetailResponse,
    BehavioralTemplateResponse,
    BehavioralTemplateUpdateRequest,
    JobBehavioralTemplateLinkRequest,
)

router = APIRouter(tags=["behavioral-templates"])


def _service(db: AsyncSession) -> BehavioralTemplateService:
    return BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db))


# Templates
@router.get("/admin/behavioral/templates", response_model=list[BehavioralTemplateResponse])
async def list_templates(
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[BehavioralTemplateResponse]:
    return await _service(db).list_templates()


@router.get("/admin/behavioral/templates/active", response_model=list[BehavioralTemplateResponse])
async def list_active_templates(
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[BehavioralTemplateResponse]:
    return await _service(db).list_active_templates()


@router.post("/admin/behavioral/templates", response_model=BehavioralTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: BehavioralTemplateCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralTemplateResponse:
    try:
        result = await _service(db).create_template(body)
        await db.commit()
        return result
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get("/admin/behavioral/templates/{template_id}", response_model=BehavioralTemplateDetailResponse)
async def get_template(
    template_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralTemplateDetailResponse:
    try:
        return await _service(db).get_template(template_id)
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.patch("/admin/behavioral/templates/{template_id}", response_model=BehavioralTemplateResponse)
async def update_template(
    template_id: UUID,
    body: BehavioralTemplateUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralTemplateResponse:
    try:
        result = await _service(db).update_template(template_id, body)
        await db.commit()
        return result
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/admin/behavioral/templates/{template_id}/activate", response_model=BehavioralTemplateResponse)
async def activate_template(
    template_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralTemplateResponse:
    try:
        result = await _service(db).activate_template(template_id)
        await db.commit()
        return result
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/admin/behavioral/templates/{template_id}/archive", response_model=BehavioralTemplateResponse)
async def archive_template(
    template_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralTemplateResponse:
    try:
        result = await _service(db).archive_template(template_id)
        await db.commit()
        return result
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# Competencies
@router.post(
    "/admin/behavioral/templates/{template_id}/competencies",
    response_model=BehavioralCompetencyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_competency(
    template_id: UUID,
    body: BehavioralCompetencyCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralCompetencyResponse:
    try:
        result = await _service(db).create_competency(template_id, body)
        await db.commit()
        return result
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.patch(
    "/admin/behavioral/templates/{template_id}/competencies/{competency_id}",
)
async def update_competency(
    template_id: UUID,
    competency_id: UUID,
    body: BehavioralCompetencyUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        update_data = body.model_dump(exclude_none=True)
        await _service(db).update_competency(template_id, competency_id, **update_data)
        await db.commit()
        return {"status": "success"}
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.delete("/admin/behavioral/templates/{template_id}/competencies/{competency_id}")
async def delete_competency(
    template_id: UUID,
    competency_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await _service(db).delete_competency(template_id, competency_id)
        await db.commit()
        return {"status": "success"}
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# Questions
@router.post(
    "/admin/behavioral/templates/{template_id}/competencies/{competency_id}/questions",
    response_model=BehavioralQuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_question(
    template_id: UUID,
    competency_id: UUID,
    body: BehavioralQuestionCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralQuestionResponse:
    try:
        result = await _service(db).create_question(template_id, competency_id, body)
        await db.commit()
        return result
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.patch(
    "/admin/behavioral/templates/{template_id}/competencies/{competency_id}/questions/{question_id}",
)
async def update_question(
    template_id: UUID,
    competency_id: UUID,
    question_id: UUID,
    body: BehavioralQuestionUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        update_data = body.model_dump(exclude_none=True)
        await _service(db).update_question(template_id, competency_id, question_id, **update_data)
        await db.commit()
        return {"status": "success"}
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.delete(
    "/admin/behavioral/templates/{template_id}/competencies/{competency_id}/questions/{question_id}",
)
async def delete_question(
    template_id: UUID,
    competency_id: UUID,
    question_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await _service(db).delete_question(template_id, competency_id, question_id)
        await db.commit()
        return {"status": "success"}
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# Job Link
@router.patch("/jobs/{job_id}/behavioral-template")
async def link_behavioral_template_to_job(
    job_id: UUID,
    body: JobBehavioralTemplateLinkRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await _service(db).link_template_to_job(job_id, body.behavioral_template_id and UUID(body.behavioral_template_id))
        await db.commit()
        return {"status": "success"}
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
