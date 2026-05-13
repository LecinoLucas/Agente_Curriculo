from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assessment_service import AssessmentService
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.repositories.sqlalchemy_assessment_repository import (
    SQLAlchemyAssessmentRepository,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.assessment_schemas import (
    AssessmentOptionCreateRequest,
    AssessmentOptionResponse,
    AssessmentOptionUpdateRequest,
    AssessmentQuestionCreateRequest,
    AssessmentQuestionResponse,
    AssessmentQuestionUpdateRequest,
    AssessmentTemplateDuplicateRequest,
    AssessmentTemplateDetailResponse,
    AssessmentTemplateListFilters,
    AssessmentTemplateCreateRequest,
    AssessmentTemplateResponse,
    AssessmentTemplateUpdateRequest,
    RecruiterCandidateAssessmentResponse,
    JobAssessmentCreateRequest,
    JobAssessmentResponse,
    JobAssessmentUpdateRequest,
)

router = APIRouter(tags=["assessments"])


def _service(db: AsyncSession) -> AssessmentService:
    return AssessmentService(SQLAlchemyAssessmentRepository(db))


@router.get("/admin/assessments/templates", response_model=list[AssessmentTemplateResponse])
async def list_assessment_templates(
    current_user: RecruiterOrAdmin,
    type: Literal["behavioral_test", "behavioral_survey"] | None = Query(default=None),
    status: Literal["draft", "active", "archived"] | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[AssessmentTemplateResponse]:
    return await _service(db).list_templates(
        AssessmentTemplateListFilters(type=type, status=status)
    )


@router.get("/admin/assessments/templates/{template_id}", response_model=AssessmentTemplateDetailResponse)
async def get_assessment_template(
    template_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentTemplateDetailResponse:
    try:
        return await _service(db).get_template(template_id)
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.post(
    "/admin/assessments/templates",
    response_model=AssessmentTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_assessment_template(
    body: AssessmentTemplateCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentTemplateResponse:
    try:
        result = await _service(db).create_template(body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)


@router.patch("/admin/assessments/templates/{template_id}", response_model=AssessmentTemplateResponse)
async def update_assessment_template(
    template_id: UUID,
    body: AssessmentTemplateUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentTemplateResponse:
    try:
        result = await _service(db).update_template(template_id, body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.post("/admin/assessments/templates/{template_id}/archive", response_model=AssessmentTemplateResponse)
async def archive_assessment_template(
    template_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentTemplateResponse:
    try:
        result = await _service(db).archive_template(template_id)
        await db.commit()
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.post("/admin/assessments/templates/{template_id}/duplicate", response_model=AssessmentTemplateResponse)
async def duplicate_assessment_template(
    template_id: UUID,
    body: AssessmentTemplateDuplicateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentTemplateResponse:
    try:
        result = await _service(db).duplicate_template(template_id, body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.post(
    "/admin/assessments/templates/{template_id}/questions",
    response_model=AssessmentQuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_assessment_question(
    template_id: UUID,
    body: AssessmentQuestionCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentQuestionResponse:
    try:
        result = await _service(db).create_question(template_id, body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.patch("/admin/assessments/questions/{question_id}", response_model=AssessmentQuestionResponse)
async def update_assessment_question(
    question_id: UUID,
    body: AssessmentQuestionUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentQuestionResponse:
    try:
        result = await _service(db).update_question(question_id, body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.delete("/admin/assessments/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assessment_question(
    question_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        await _service(db).delete_question(question_id)
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.post(
    "/admin/assessments/questions/{question_id}/options",
    response_model=AssessmentOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_assessment_option(
    question_id: UUID,
    body: AssessmentOptionCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentOptionResponse:
    try:
        result = await _service(db).create_option(question_id, body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.patch("/admin/assessments/options/{option_id}", response_model=AssessmentOptionResponse)
async def update_assessment_option(
    option_id: UUID,
    body: AssessmentOptionUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AssessmentOptionResponse:
    try:
        result = await _service(db).update_option(option_id, body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.delete("/admin/assessments/options/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assessment_option(
    option_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        await _service(db).delete_option(option_id)
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.get("/jobs/{job_id}/assessments", response_model=list[JobAssessmentResponse])
async def list_job_assessments(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[JobAssessmentResponse]:
    return await _service(db).list_job_assessments(job_id)


@router.post("/jobs/{job_id}/assessments", response_model=JobAssessmentResponse, status_code=status.HTTP_201_CREATED)
async def attach_assessment_to_job(
    job_id: UUID,
    body: JobAssessmentCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobAssessmentResponse:
    try:
        result = await _service(db).attach_template_to_job(job_id, body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Avaliação já vinculada à vaga")


@router.patch("/jobs/{job_id}/assessments/{job_assessment_id}", response_model=JobAssessmentResponse)
async def update_job_assessment(
    job_id: UUID,
    job_assessment_id: UUID,
    body: JobAssessmentUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobAssessmentResponse:
    try:
        result = await _service(db).update_job_assessment(
            job_id=job_id,
            job_assessment_id=job_assessment_id,
            body=body,
        )
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.delete("/jobs/{job_id}/assessments/{job_assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job_assessment(
    job_id: UUID,
    job_assessment_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        await _service(db).delete_job_assessment(
            job_id=job_id,
            job_assessment_id=job_assessment_id,
        )
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.get("/candidates/{candidate_id}/assessments", response_model=list[RecruiterCandidateAssessmentResponse])
async def list_candidate_assessments(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    include_answers: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> list[RecruiterCandidateAssessmentResponse]:
    return await _service(db).list_recruiter_assignments(
        candidate_id,
        include_answers=include_answers,
    )
