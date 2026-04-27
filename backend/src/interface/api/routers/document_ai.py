from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admission.models.admission_models import CandidateDocument
from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.document_ai_schemas import (
    DocumentAIAnalysisResponse,
    DocumentAIRetryResponse,
)
from src.interface.workers.document_ai_dispatcher import enqueue_document_ai
from src.observability.context import get_correlation_id

router = APIRouter(prefix="/document-ai", tags=["document-ai"])


def _to_response(model: DocumentAIAnalysisModel) -> DocumentAIAnalysisResponse:
    return DocumentAIAnalysisResponse(
        id=model.id,
        document_id=model.document_id,
        raw_text=model.raw_text,
        clean_text=model.clean_text,
        structured_data=model.structured_data,
        confidence=float(model.confidence) if model.confidence is not None else None,
        status=model.status,
        model_used=model.model_used,
        created_at=model.created_at,
        error_message=model.error_message,
    )


@router.get("/{document_id}/analysis", response_model=DocumentAIAnalysisResponse)
async def get_latest_document_ai_analysis(
    document_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> DocumentAIAnalysisResponse:
    analysis = await db.scalar(
        sa.select(DocumentAIAnalysisModel)
        .where(DocumentAIAnalysisModel.document_id == document_id)
        .order_by(DocumentAIAnalysisModel.created_at.desc())
        .limit(1)
    )
    if analysis is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    return _to_response(analysis)


@router.get("/{document_id}/history", response_model=list[DocumentAIAnalysisResponse])
async def get_document_ai_history(
    document_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[DocumentAIAnalysisResponse]:
    rows = await db.execute(
        sa.select(DocumentAIAnalysisModel)
        .where(DocumentAIAnalysisModel.document_id == document_id)
        .order_by(DocumentAIAnalysisModel.created_at.desc())
    )
    analyses = rows.scalars().all()
    return [_to_response(item) for item in analyses]


@router.post("/{analysis_id}/retry", response_model=DocumentAIRetryResponse)
async def retry_document_ai_analysis(
    analysis_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> DocumentAIRetryResponse:
    analysis = await db.scalar(
        sa.select(DocumentAIAnalysisModel).where(DocumentAIAnalysisModel.id == analysis_id)
    )
    if analysis is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    if analysis.status != "failed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Retry is allowed only for failed analyses",
        )

    document = await db.scalar(
        sa.select(CandidateDocument).where(CandidateDocument.id == analysis.document_id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    new_analysis = DocumentAIAnalysisModel(
        document_id=analysis.document_id,
        status="pending",
        model_used=analysis.model_used,
        created_at=datetime.now(UTC),
    )
    db.add(new_analysis)
    await db.commit()
    await db.refresh(new_analysis)

    try:
        enqueue_document_ai(
            admission_id=document.admission_id,
            document_id=document.id,
            analysis_id=new_analysis.id,
            correlation_id=get_correlation_id(),
        )
    except Exception as exc:
        new_analysis.status = "failed"
        new_analysis.error_message = f"retry_enqueue_failed:{exc}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue retry",
        )

    return DocumentAIRetryResponse(
        analysis_id=analysis.id,
        new_analysis_id=new_analysis.id,
        status="pending",
    )
