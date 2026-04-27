from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admission.models.admission_models import (
    Admission,
    CandidateDocument,
    DocumentRequirement,
)
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)


class AdmissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @property
    def session(self) -> AsyncSession:
        return self._session

    def begin_nested(self):
        return self._session.begin_nested()

    async def find_by_candidate_and_job(self, candidate_id: UUID, job_id: UUID) -> Admission | None:
        return await self._session.scalar(
            sa.select(Admission).where(
                Admission.candidate_id == candidate_id,
                Admission.job_id == job_id,
            )
        )

    async def get_admission_for_update(self, admission_id: UUID) -> Admission | None:
        return await self._session.scalar(
            sa.select(Admission)
            .where(Admission.id == admission_id)
            .with_for_update()
        )

    async def find_hired_pipeline_entry(self, candidate_id: UUID, job_id: UUID) -> CandidatePipelineModel | None:
        return await self._session.scalar(
            sa.select(CandidatePipelineModel).where(
                CandidatePipelineModel.candidate_id == candidate_id,
                CandidatePipelineModel.job_id == job_id,
                CandidatePipelineModel.status == "hired",
            )
        )

    async def find_hired_pipeline_entry_for_update(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidatePipelineModel | None:
        return await self._session.scalar(
            sa.select(CandidatePipelineModel)
            .where(
                CandidatePipelineModel.candidate_id == candidate_id,
                CandidatePipelineModel.job_id == job_id,
                CandidatePipelineModel.status == "hired",
            )
            .with_for_update()
        )

    async def create_admission(self, candidate_id: UUID, job_id: UUID) -> Admission:
        admission = Admission(
            candidate_id=candidate_id,
            job_id=job_id,
            status="pending",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self._session.add(admission)
        await self._session.flush()
        await self._session.refresh(admission)
        return admission

    async def get_admission(self, admission_id: UUID) -> Admission | None:
        return await self._session.scalar(sa.select(Admission).where(Admission.id == admission_id))

    async def get_requirement(self, requirement_id: UUID) -> DocumentRequirement | None:
        return await self._session.scalar(
            sa.select(DocumentRequirement).where(DocumentRequirement.id == requirement_id)
        )

    async def create_candidate_document(
        self,
        admission_id: UUID,
        document_requirement_id: UUID,
        file_path: str,
    ) -> CandidateDocument:
        document = CandidateDocument(
            admission_id=admission_id,
            document_requirement_id=document_requirement_id,
            file_path=file_path,
            status="pending",
            uploaded_at=datetime.now(UTC),
            validated_at=None,
        )
        self._session.add(document)
        await self._session.flush()
        await self._session.refresh(document)
        return document

    async def get_candidate_document(self, doc_id: UUID) -> CandidateDocument | None:
        return await self._session.scalar(
            sa.select(CandidateDocument).where(CandidateDocument.id == doc_id)
        )

    async def get_candidate_document_for_update(
        self,
        admission_id: UUID,
        document_requirement_id: UUID,
    ) -> CandidateDocument | None:
        return await self._session.scalar(
            sa.select(CandidateDocument)
            .where(
                CandidateDocument.admission_id == admission_id,
                CandidateDocument.document_requirement_id == document_requirement_id,
            )
            .with_for_update()
        )

    async def replace_candidate_document_file(
        self,
        document: CandidateDocument,
        file_path: str,
    ) -> CandidateDocument:
        document.file_path = file_path
        document.status = "pending"
        document.structured_data = None
        document.uploaded_at = datetime.now(UTC)
        document.validated_at = None
        await self._session.flush()
        await self._session.refresh(document)
        return document

    async def update_candidate_document_status(self, doc: CandidateDocument, status: str) -> CandidateDocument:
        doc.status = status
        doc.validated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(doc)
        return doc

    async def save_candidate_document_structured_data(
        self,
        document: CandidateDocument,
        structured_data: dict,
    ) -> CandidateDocument:
        document.structured_data = structured_data
        await self._session.flush()
        await self._session.refresh(document)
        return document

    async def create_document_ai_analysis(
        self,
        document_id: UUID,
        model_used: str = "document_ai_v1",
    ) -> DocumentAIAnalysisModel:
        analysis = DocumentAIAnalysisModel(
            document_id=document_id,
            status="pending",
            model_used=model_used,
            created_at=datetime.now(UTC),
        )
        self._session.add(analysis)
        await self._session.flush()
        await self._session.refresh(analysis)
        return analysis

    async def mark_document_ai_analysis_failed(
        self,
        analysis: DocumentAIAnalysisModel,
        error_message: str,
    ) -> DocumentAIAnalysisModel:
        analysis.status = "failed"
        analysis.error_message = error_message
        await self._session.flush()
        await self._session.refresh(analysis)
        return analysis

    async def calculate_admission_metrics(self, admission_id: UUID) -> dict[str, int]:
        required_rejected_case = sa.case(
            (
                sa.and_(
                    DocumentRequirement.is_required.is_(True),
                    CandidateDocument.status == "rejected",
                ),
                1,
            ),
            else_=0,
        )

        result = await self._session.execute(
            sa.select(
                sa.func.coalesce(
                    sa.func.count(sa.distinct(sa.case((DocumentRequirement.is_required.is_(True), DocumentRequirement.id)))),
                    0,
                ).label("required_total"),
                sa.func.coalesce(
                    sa.func.count(
                        sa.distinct(
                            sa.case(
                                (
                                    sa.and_(
                                        DocumentRequirement.is_required.is_(True),
                                        CandidateDocument.id.is_not(None),
                                    ),
                                    DocumentRequirement.id,
                                )
                            )
                        )
                    ),
                    0,
                ).label("required_sent"),
                sa.func.coalesce(
                    sa.func.count(
                        sa.distinct(
                            sa.case(
                                (
                                    sa.and_(
                                        DocumentRequirement.is_required.is_(True),
                                        CandidateDocument.status == "approved",
                                    ),
                                    DocumentRequirement.id,
                                )
                            )
                        )
                    ),
                    0,
                ).label("required_approved"),
                sa.func.coalesce(sa.func.sum(required_rejected_case), 0).label("required_rejected"),
                sa.func.coalesce(sa.func.count(CandidateDocument.id), 0).label("sent_total"),
            )
            .select_from(DocumentRequirement)
            .join(
                CandidateDocument,
                sa.and_(
                    CandidateDocument.document_requirement_id == DocumentRequirement.id,
                    CandidateDocument.admission_id == admission_id,
                ),
                isouter=True,
            )
        )

        row = result.mappings().one()
        return {
            "required_total": int(row["required_total"]),
            "required_sent": int(row["required_sent"]),
            "required_approved": int(row["required_approved"]),
            "required_rejected": int(row["required_rejected"]),
            "sent_total": int(row["sent_total"]),
        }

    async def set_admission_status(self, admission: Admission, status: str) -> Admission:
        admission.status = status
        admission.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(admission)
        return admission
