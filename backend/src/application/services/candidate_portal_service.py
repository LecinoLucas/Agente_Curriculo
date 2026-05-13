from __future__ import annotations

import re
from datetime import UTC, datetime
from hashlib import sha256
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assessment_service import AssessmentService
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    SQLAlchemyCandidateRepository,
)
from src.infrastructure.repositories.sqlalchemy_assessment_repository import (
    SQLAlchemyAssessmentRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)
from src.infrastructure.storage.resume_files import write_resume_file
from src.interface.api.schemas.candidate_portal_schemas import (
    CandidatePortalActiveApplicationResponse,
    CandidatePortalApplicationResponse,
    CandidatePortalCandidateSummaryResponse,
    CandidatePortalOverviewResponse,
    CandidatePortalPublicInterviewResponse,
    CandidatePortalResumeResponse,
    CandidatePortalTimelineResponse,
    CandidatePortalTimelineStepResponse,
    CandidatePortalResumeUploadResponse,
    CandidatePortalUpdateProfileRequest,
)
from src.interface.api.schemas.assessment_schemas import CandidateAssessmentSummaryResponse
from src.interface.workers.resume_extraction_dispatcher import enqueue_resume_extraction

logger = structlog.get_logger(__name__)

MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024


class CandidatePortalProfileConflictError(Exception):
    pass


class CandidatePortalInvalidFileError(Exception):
    pass


class CandidatePortalService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._candidate_repo = SQLAlchemyCandidateRepository(db)
        self._resume_repo = SQLAlchemyResumeRepository(db)

    async def get_overview(self, candidate_id: UUID) -> CandidatePortalOverviewResponse:
        candidate = await self._get_candidate_row(candidate_id)
        if candidate is None:
            raise CandidatePortalProfileConflictError

        latest_resume = await self._build_latest_resume(candidate_id)
        pipeline_rows = await self._candidate_repo.list_pipeline_entries_for_portal(candidate_id)
        active_pipeline_rows = await self._candidate_repo.list_active_pipeline_entries(candidate_id)
        active_pipeline_row = self._resolve_active_pipeline_row(
            candidate_id=candidate_id,
            active_pipeline_rows=active_pipeline_rows,
        )

        active_application: CandidatePortalActiveApplicationResponse | None = None
        public_timeline: CandidatePortalTimelineResponse | None = None
        assessments: list[CandidateAssessmentSummaryResponse] = []
        if active_pipeline_row is not None:
            active_application = await self._build_active_application(
                candidate_id=candidate_id,
                active_pipeline_row=active_pipeline_row,
                latest_resume=latest_resume,
            )
            assessments = await self._build_public_assessments(
                candidate_id=candidate_id,
                active_pipeline_row=active_pipeline_row,
            )
            public_timeline = await self._build_public_timeline(
                active_pipeline_row=active_pipeline_row,
                analysis_status=active_application.analysis_status,
                assessments=assessments,
            )

        history = await self._build_history_applications(
            candidate_id=candidate_id,
            pipeline_rows=pipeline_rows,
            active_pipeline_row=active_pipeline_row,
            latest_resume=latest_resume,
        )

        source_value = candidate["application_source"]
        source_label = self._source_label(source_value)
        return CandidatePortalOverviewResponse(
            candidate=CandidatePortalCandidateSummaryResponse(
                id=candidate["id"],
                full_name=candidate["full_name"],
                cpf_masked=self._mask_cpf(candidate["cpf"]),
                email=candidate["email"],
                email_masked=self._mask_email(candidate["email"]),
                phone=candidate["phone"],
                phone_masked=self._mask_phone(candidate["phone"]),
                city=candidate["location_city"],
                state=candidate["location_state"],
                application_source=source_value,
                application_source_label=source_label,
            ),
            active_application=active_application,
            application_history=history,
            latest_resume=latest_resume,
            talent_pool=active_application is None,
            status_public=active_application.status_public if active_application else "Banco de Talentos",
            public_timeline=public_timeline,
            assessments=assessments,
        )

    async def update_profile(
        self,
        candidate_id: UUID,
        body: CandidatePortalUpdateProfileRequest,
    ) -> CandidatePortalOverviewResponse:
        candidate = await self._get_candidate_row(candidate_id)
        if candidate is None:
            raise CandidatePortalProfileConflictError

        values: dict[str, object] = {}
        if body.email is not None:
            email = body.email.lower().strip()
            existing = await self._find_candidate_by_email(email)
            if existing is not None and existing["id"] != candidate["id"]:
                raise CandidatePortalProfileConflictError
            values["email"] = email

        if body.phone is not None:
            values["phone"] = self._normalize_phone(body.phone)
        if body.city is not None:
            values["location_city"] = body.city.strip() or None
        if body.state is not None:
            values["location_state"] = body.state.strip().upper() or None

        values["updated_at"] = datetime.now(UTC)
        await self._db.execute(
            sa.update(CandidateModel)
            .where(CandidateModel.id == candidate_id)
            .values(**values)
        )
        await self._db.flush()
        return await self.get_overview(candidate_id)

    async def upload_resume(
        self,
        *,
        candidate_id: UUID,
        file_bytes: bytes,
        file_name: str,
        file_content_type: str | None,
        uploaded_by: UUID,
    ) -> CandidatePortalResumeUploadResponse:
        candidate = await self._get_candidate_row(candidate_id)
        if candidate is None:
            raise CandidatePortalProfileConflictError

        self._validate_pdf_upload(file_name, file_content_type, file_bytes)

        resume_id = uuid4()
        resume = await self._resume_repo.create_resume(
            ResumeModel(
                id=resume_id,
                candidate_id=candidate_id,
                title="Currículo - Portal do Candidato",
                status="active",
                current_version=1,
                created_by=uploaded_by,
            )
        )
        version_id = uuid4()
        s3_key = f"resumes/{candidate_id}/{resume_id}/v1_portal.pdf"
        version = await self._resume_repo.create_version(
            ResumeVersionModel(
                id=version_id,
                resume_id=resume.id,
                version_number=1,
                s3_bucket="resume-ai-dev-uploads",
                s3_key=s3_key,
                original_file_name=file_name,
                file_size_bytes=len(file_bytes),
                file_hash_sha256=sha256(file_bytes).hexdigest(),
                mime_type="application/pdf",
                extraction_status="pending",
                uploaded_by=uploaded_by,
                uploaded_at=datetime.now(UTC),
            )
        )
        write_resume_file(version.s3_key, file_bytes)
        enqueue_resume_extraction(version.id)

        logger.info(
            "candidate_portal.resume_uploaded",
            candidate_id=str(candidate_id),
            resume_id=str(resume.id),
            resume_version_id=str(version.id),
        )

        return CandidatePortalResumeUploadResponse(
            resume_id=resume.id,
            resume_version_id=version.id,
            extraction_status="pending",
            message="Novo currículo enviado. A extração foi iniciada.",
        )

    async def _build_latest_resume(
        self,
        candidate_id: UUID,
    ) -> CandidatePortalResumeResponse | None:
        rows = await self._candidate_repo.list_resume_summaries(candidate_id)
        if not rows:
            return None
        latest = rows[0]
        return CandidatePortalResumeResponse(
            resume_id=latest["resume_id"],
            resume_version_id=latest.get("current_version_id"),
            file_name=latest.get("current_file_name"),
            extraction_status=latest.get("extraction_status"),
            uploaded_at=latest["updated_at"],
        )

    async def _build_active_application(
        self,
        *,
        candidate_id: UUID,
        active_pipeline_row: dict,
        latest_resume: CandidatePortalResumeResponse | None,
    ) -> CandidatePortalActiveApplicationResponse:
        analysis_summary = None
        current_analysis_id = active_pipeline_row.get("current_analysis_id")
        if current_analysis_id is not None:
            analysis_summary = await self._candidate_repo.find_analysis_summary_by_id_for_candidate(
                candidate_id=candidate_id,
                analysis_id=current_analysis_id,
            )

        analysis_status = analysis_summary.get("status") if analysis_summary else None
        status_public = self._map_public_status(
            stage=active_pipeline_row["stage"],
            relationship_status=active_pipeline_row["relationship_status"],
            analysis_status=analysis_status,
        )
        resume_version_id = (
            analysis_summary.get("resume_version_id")
            if analysis_summary is not None
            else active_pipeline_row.get("resume_version_id")
        )
        resume_file_name = analysis_summary.get("resume_file_name") if analysis_summary else None
        if resume_file_name is None and resume_version_id is not None:
            resume_file_name = await self._candidate_repo.find_resume_file_name_by_version(
                candidate_id=candidate_id,
                resume_version_id=resume_version_id,
            )
        if resume_file_name is None:
            resume_file_name = latest_resume.file_name if latest_resume is not None else None

        submitted_at = active_pipeline_row.get("entered_at") or active_pipeline_row["updated_at"]
        return CandidatePortalActiveApplicationResponse(
            pipeline_id=active_pipeline_row["pipeline_id"],
            job_id=active_pipeline_row["job_id"],
            job_title=active_pipeline_row.get("job_title"),
            pipeline_stage=active_pipeline_row["stage"],
            status_public=status_public,
            submitted_at=submitted_at,
            current_analysis_id=current_analysis_id,
            analysis_status=analysis_status,
            resume_version_id=resume_version_id,
            resume_filename=resume_file_name,
            is_talent_pool=False,
        )

    async def _build_history_applications(
        self,
        *,
        candidate_id: UUID,
        pipeline_rows: list[dict],
        active_pipeline_row: dict | None,
        latest_resume: CandidatePortalResumeResponse | None,
    ) -> list[CandidatePortalApplicationResponse]:
        active_pipeline_id = active_pipeline_row["pipeline_id"] if active_pipeline_row else None
        items: list[CandidatePortalApplicationResponse] = []
        for row in pipeline_rows:
            if active_pipeline_id is not None and row.get("pipeline_id") == active_pipeline_id:
                continue
            status_label = self._map_public_status(
                stage=row["stage"],
                relationship_status=row["relationship_status"],
                analysis_status=None,
            )
            items.append(
                CandidatePortalApplicationResponse(
                    pipeline_id=row.get("pipeline_id"),
                    job_id=row["job_id"],
                    job_title=row.get("job_title"),
                    status=self._status_code_from_public_label(status_label),
                    status_label=status_label,
                    submitted_at=row.get("entered_at") or row["updated_at"],
                    updated_at=row["updated_at"],
                    resume_file_name=latest_resume.file_name if latest_resume is not None else None,
                    analysis_status=None,
                    application_source=None,
                    talent_pool=False,
                    talent_pool_profile_status=None,
                )
            )
        return items

    def _resolve_active_pipeline_row(
        self,
        *,
        candidate_id: UUID,
        active_pipeline_rows: list[dict],
    ) -> dict | None:
        if len(active_pipeline_rows) > 1:
            logger.error(
                "candidate_portal.integrity.multiple_active_pipelines",
                candidate_id=str(candidate_id),
                pipeline_ids=[str(item.get("pipeline_id")) for item in active_pipeline_rows],
            )
        return active_pipeline_rows[0] if active_pipeline_rows else None

    async def _build_public_timeline(
        self,
        *,
        active_pipeline_row: dict,
        analysis_status: str | None,
        assessments: list[CandidateAssessmentSummaryResponse],
    ) -> CandidatePortalTimelineResponse:
        current_key = self._current_timeline_key(
            stage=active_pipeline_row["stage"],
            relationship_status=active_pipeline_row["relationship_status"],
            analysis_status=analysis_status,
            assessments=assessments,
        )
        interview = await self._find_public_interview(active_pipeline_row)

        definitions: list[tuple[str, str, str]] = [
            (
                "application_received",
                "Inscrição recebida",
                "Recebemos sua candidatura.",
            ),
            (
                "resume_analysis",
                "Currículo em análise",
                "Seu currículo está sendo avaliado.",
            ),
        ]
        if any(item.type == "behavioral_test" for item in assessments):
            definitions.append(
                (
                    "behavioral_test",
                    "Teste comportamental",
                    self._assessment_description(assessments, "behavioral_test"),
                )
            )
        if any(item.type == "behavioral_survey" for item in assessments):
            definitions.append(
                (
                    "behavioral_survey",
                    "Pesquisa comportamental",
                    self._assessment_description(assessments, "behavioral_survey"),
                )
            )
        definitions.extend(
            [
                (
                "screening",
                "Em triagem",
                "Nossa equipe está analisando seu perfil.",
                ),
                (
                "interview",
                "Entrevista",
                self._interview_description(interview, current_key=current_key),
                ),
                (
                "result",
                self._result_label(active_pipeline_row["relationship_status"], active_pipeline_row["stage"]),
                "Você será atualizado sobre o andamento.",
                ),
            ]
        )
        order = [item[0] for item in definitions]
        current_index = order.index(current_key)
        steps: list[CandidatePortalTimelineStepResponse] = []
        for index, (key, label, description) in enumerate(definitions):
            if key == current_key:
                status = "current"
            elif index < current_index:
                status = "completed"
            else:
                status = "upcoming"
            if current_key == "result" and key == "result" and label == "Processo encerrado":
                status = "closed"
            steps.append(
                CandidatePortalTimelineStepResponse(
                    key=key,
                    label=label,
                    status=status,
                    description=description,
                    interview=interview if key == "interview" else None,
                )
            )
        return CandidatePortalTimelineResponse(
            current_step_key=current_key,
            current_step_label=next(label for key, label, _ in definitions if key == current_key),
            steps=steps,
        )

    async def _build_public_assessments(
        self,
        *,
        candidate_id: UUID,
        active_pipeline_row: dict,
    ) -> list[CandidateAssessmentSummaryResponse]:
        job_id = active_pipeline_row.get("job_id")
        pipeline_id = active_pipeline_row.get("pipeline_id")
        if job_id is not None:
            pipeline_id = pipeline_id or uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}")
            await AssessmentService(SQLAlchemyAssessmentRepository(self._db)).create_assignments_for_job(
                candidate_id=candidate_id,
                job_id=job_id,
                pipeline_id=pipeline_id,
            )
        rows = await SQLAlchemyAssessmentRepository(self._db).list_candidate_assignments(
            candidate_id,
            pipeline_id=pipeline_id,
        )
        return [
            CandidateAssessmentSummaryResponse(
                id=row["id"],
                type=row["type"],
                title=row["title"],
                description=row["description"],
                status=row["status"],
                required=bool((row.get("metadata_payload") or {}).get("required", True)),
                due_at=row["due_at"],
                assigned_at=row["assigned_at"],
                started_at=row["started_at"],
                completed_at=row["completed_at"],
                result_summary=None if row["status"] != "completed" else "Concluído",
            )
            for row in rows
        ]

    async def _find_public_interview(self, active_pipeline_row: dict) -> CandidatePortalPublicInterviewResponse | None:
        pipeline_id = active_pipeline_row.get("pipeline_id")
        if pipeline_id is None:
            return None

        row = await self._db.execute(
            sa.select(
                InterviewScheduleModel.status,
                InterviewScheduleModel.scheduled_start,
                InterviewScheduleModel.interview_format,
                InterviewScheduleModel.location,
                InterviewScheduleModel.meeting_url,
                InterviewScheduleModel.public_notes,
            )
            .where(
                sa.or_(
                    InterviewScheduleModel.pipeline_id == pipeline_id,
                    InterviewScheduleModel.pipeline_id.is_(None),
                ),
                InterviewScheduleModel.candidate_id == active_pipeline_row["candidate_id"],
                InterviewScheduleModel.job_id == active_pipeline_row["job_id"],
                InterviewScheduleModel.status.in_(("scheduled", "rescheduled")),
            )
            .order_by(InterviewScheduleModel.scheduled_start.asc())
            .limit(1)
        )
        mapping = row.mappings().first()
        if mapping is None:
            cancelled = await self._db.execute(
                sa.select(InterviewScheduleModel.status)
                .where(
                    sa.or_(
                        InterviewScheduleModel.pipeline_id == pipeline_id,
                        InterviewScheduleModel.pipeline_id.is_(None),
                    ),
                    InterviewScheduleModel.candidate_id == active_pipeline_row["candidate_id"],
                    InterviewScheduleModel.job_id == active_pipeline_row["job_id"],
                    InterviewScheduleModel.status == "cancelled",
                )
                .order_by(InterviewScheduleModel.updated_at.desc())
                .limit(1)
            )
            if cancelled.scalar_one_or_none() == "cancelled":
                return CandidatePortalPublicInterviewResponse(status="cancelled")
            return None
        return CandidatePortalPublicInterviewResponse(
            status=mapping["status"],
            scheduled_at=mapping["scheduled_start"],
            interview_format=mapping["interview_format"],
            location=mapping["location"],
            meeting_url=mapping["meeting_url"],
            public_notes=mapping["public_notes"],
        )

    @staticmethod
    def _current_timeline_key(
        *,
        stage: str,
        relationship_status: str,
        analysis_status: str | None,
        assessments: list[CandidateAssessmentSummaryResponse],
    ) -> str:
        if relationship_status in {"rejected", "hired", "withdrawn", "archived"} or stage in {"hired", "rejected"}:
            return "result"
        if stage in {"hr_interview", "technical_interview", "final", "offer"}:
            return "interview"
        if stage == "screening":
            return "screening"
        pending_test = next(
            (item for item in assessments if item.type == "behavioral_test" and item.status in {"pending", "in_progress"}),
            None,
        )
        if pending_test is not None:
            return "behavioral_test"
        pending_survey = next(
            (item for item in assessments if item.type == "behavioral_survey" and item.status in {"pending", "in_progress"}),
            None,
        )
        if pending_survey is not None:
            return "behavioral_survey"
        if (analysis_status or "").lower() in {"pending", "processing", "retry_scheduled"}:
            return "resume_analysis"
        return "application_received"

    @staticmethod
    def _assessment_description(
        assessments: list[CandidateAssessmentSummaryResponse],
        assessment_type: str,
    ) -> str:
        item = next((assessment for assessment in assessments if assessment.type == assessment_type), None)
        if item is None:
            return ""
        if item.status == "completed":
            return "Avaliação concluída. Nossa equipe seguirá com a análise."
        if assessment_type == "behavioral_test":
            return "Complete o teste para continuar no processo."
        return "Responda a pesquisa para complementar sua candidatura."

    @staticmethod
    def _interview_description(
        interview: CandidatePortalPublicInterviewResponse | None,
        *,
        current_key: str,
    ) -> str:
        if interview is None:
            if current_key == "interview":
                return "Você avançou para a etapa de entrevista. Nossa equipe entrará em contato para agendar."
            return "Caso avance, entraremos em contato."
        if interview.status == "cancelled":
            return "Sua entrevista será reagendada. Nossa equipe entrará em contato."
        if interview.scheduled_at is not None:
            return "Sua entrevista foi agendada."
        return "Você avançou para a etapa de entrevista. Nossa equipe entrará em contato para agendar."

    @staticmethod
    def _result_label(relationship_status: str, stage: str) -> str:
        if relationship_status == "hired" or stage == "hired":
            return "Aprovado"
        if relationship_status in {"rejected", "withdrawn", "archived"} or stage == "rejected":
            return "Processo encerrado"
        return "Resultado"

    @staticmethod
    def _map_public_status(
        *,
        stage: str,
        relationship_status: str,
        analysis_status: str | None,
    ) -> str:
        normalized_analysis = (analysis_status or "").lower()
        if relationship_status in {"rejected", "hired", "withdrawn", "archived"}:
            return "Processo encerrado"
        if normalized_analysis in {"pending", "processing", "retry_scheduled"}:
            return "Currículo em análise"
        if normalized_analysis == "completed":
            if stage == "entry":
                return "Currículo analisado"
        if stage in {"entry"}:
            return "Inscrição recebida"
        if stage in {"screening"}:
            return "Em triagem"
        if stage in {"hr_interview", "technical_interview", "final", "offer"}:
            return "Entrevista"
        return "Inscrição recebida"

    @staticmethod
    def _status_code_from_public_label(status_public: str) -> str:
        if status_public == "Currículo em análise":
            return "analysis"
        if status_public == "Currículo analisado":
            return "analyzed"
        if status_public == "Em triagem":
            return "screening"
        if status_public == "Entrevista":
            return "interview"
        if status_public == "Processo encerrado":
            return "finished"
        if status_public == "Banco de Talentos":
            return "talent_pool"
        return "received"

    @staticmethod
    def _mask_cpf(cpf: str | None) -> str | None:
        if not cpf:
            return None
        digits = re.sub(r"\D", "", cpf)
        if len(digits) != 11:
            return "***.***.***-**"
        return f"{digits[:3]}.***.***-{digits[-2:]}"

    @staticmethod
    def _mask_email(email: str | None) -> str | None:
        if not email:
            return None
        if "@" not in email:
            return "***"
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            local_masked = local[0] + "*" if local else "*"
        else:
            local_masked = local[:2] + "*" * (len(local) - 2)
        return f"{local_masked}@{domain}"

    @staticmethod
    def _mask_phone(phone: str | None) -> str | None:
        if not phone:
            return None
        digits = re.sub(r"\D", "", phone)
        if len(digits) < 4:
            return "*" * len(digits)
        hidden = "*" * max(0, len(digits) - 4)
        return f"{hidden}{digits[-4:]}"

    @staticmethod
    def _source_label(value: str | None) -> str:
        if value == "public_application":
            return "Candidatura pública"
        if value == "public_google":
            return "Google"
        if value == "manual":
            return "Cadastro manual"
        return "Não informado"

    @staticmethod
    def _normalize_phone(phone: str | None) -> str | None:
        if phone is None:
            return None
        digits = re.sub(r"\D", "", phone)
        return digits or None

    @staticmethod
    def _validate_pdf_upload(file_name: str, content_type: str | None, content: bytes) -> None:
        if not content:
            raise CandidatePortalInvalidFileError("Arquivo vazio")
        if len(content) > MAX_PDF_UPLOAD_BYTES:
            raise CandidatePortalInvalidFileError("Arquivo muito grande (máx 10MB)")
        if content_type not in {"application/pdf", "application/octet-stream", None, ""}:
            raise CandidatePortalInvalidFileError("Arquivo deve ser enviado como PDF")
        if not file_name.lower().endswith(".pdf"):
            raise CandidatePortalInvalidFileError("Nome do arquivo deve terminar com .pdf")
        if not content.startswith(b"%PDF"):
            raise CandidatePortalInvalidFileError("Conteúdo enviado não parece ser um PDF válido")

    async def _get_candidate_row(self, candidate_id: UUID) -> dict | None:
        row = await self._db.execute(
            sa.select(
                CandidateModel.id,
                CandidateModel.full_name,
                CandidateModel.email,
                CandidateModel.phone,
                CandidateModel.cpf,
                CandidateModel.location_city,
                CandidateModel.location_state,
                CandidateModel.application_source,
                CandidateModel.created_at,
            ).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
        )
        mapping = row.mappings().first()
        return dict(mapping) if mapping is not None else None

    async def _find_candidate_by_email(self, email: str) -> dict | None:
        row = await self._db.execute(
            sa.select(CandidateModel.id, CandidateModel.email).where(
                CandidateModel.email == email,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
        )
        mapping = row.mappings().first()
        return dict(mapping) if mapping is not None else None
