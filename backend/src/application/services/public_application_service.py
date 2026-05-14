import re
from datetime import UTC, datetime, timezone
from hashlib import sha256
from uuid import UUID, uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_service import CandidateService
from src.application.services.candidate_service import APPLICATION_SOURCE_PUBLIC
from src.application.services.behavioral_assignment_service import BehavioralAssignmentService
from src.application.dtos.analysis_dtos import RequestAnalysisCommand
from src.application.use_cases.analyses.request_analysis import RequestAnalysisUseCase
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_repository import (
    SQLAlchemyBehavioralAssignmentRepository,
)
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    SQLAlchemyCandidateRepository,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.infrastructure.storage.resume_files import write_resume_file
from src.infrastructure.security.password_service import hash_password, verify_password
from src.interface.api.schemas.candidate_schemas import CreateCandidateRequest
from src.interface.api.schemas.public_schemas import PublicApplyResponse
from src.interface.workers.resume_extraction_dispatcher import enqueue_resume_extraction
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineEventModel
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import _candidate_job_pipeline_key

logger = structlog.get_logger(__name__)

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-000000000001")
MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024


class PublicApplicationError(Exception):
    pass


class PublicApplicationCpfError(PublicApplicationError):
    pass


class PublicApplicationEmailError(PublicApplicationError):
    pass


class PublicApplicationJobUnavailableError(PublicApplicationError):
    pass


class PublicApplicationDuplicateJobError(PublicApplicationError):
    pass


class PublicApplicationExistingAccountError(PublicApplicationError):
    pass


class PublicApplicationFileError(PublicApplicationError):
    pass


class PublicApplicationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._candidate_repo = SQLAlchemyCandidateRepository(db)
        self._resume_repo = SQLAlchemyResumeRepository(db)
        self._job_repo = SQLAlchemyJobRepository(db)
        self._pipeline_repo = SQLAlchemyPipelineRepository(db)
        self._candidate_service = CandidateService(self._candidate_repo)

    @staticmethod
    def _validate_cpf(cpf: str) -> str:
        """Valida CPF com algoritmo mod-11. Retorna apenas dígitos."""
        digits = re.sub(r"\D", "", cpf)
        if len(digits) != 11:
            raise PublicApplicationCpfError("CPF deve conter 11 dígitos")

        if len(set(digits)) == 1:
            raise PublicApplicationCpfError("CPF inválido")

        for i in range(9, 11):
            s = sum(int(digits[j]) * (i + 1 - j) for j in range(i))
            d = (s * 10 % 11) % 10
            if d != int(digits[i]):
                raise PublicApplicationCpfError("CPF inválido")

        return digits

    @staticmethod
    def _validate_phone(phone: str) -> str:
        """Valida e normaliza telefone brasileiro."""
        digits = re.sub(r"\D", "", phone)
        if len(digits) < 10 or len(digits) > 11:
            raise ValidationException("Telefone inválido")
        return digits

    @staticmethod
    def _validate_pdf_upload(file_name: str, content_type: str | None, content: bytes) -> None:
        """Valida arquivo PDF."""
        if not content:
            raise PublicApplicationFileError("Arquivo vazio")

        if len(content) > MAX_PDF_UPLOAD_BYTES:
            raise PublicApplicationFileError(f"Arquivo muito grande (máx {MAX_PDF_UPLOAD_BYTES // (1024 * 1024)}MB)")

        if content_type not in {"application/pdf", "application/octet-stream", None, ""}:
            raise PublicApplicationFileError("Arquivo deve ser enviado como PDF")

        if not file_name.lower().endswith(".pdf"):
            raise PublicApplicationFileError("Nome do arquivo deve terminar com .pdf")

        if not content.startswith(b"%PDF"):
            raise PublicApplicationFileError("Conteúdo enviado não parece ser um PDF válido")

    @staticmethod
    def _validate_password(password: str) -> None:
        if len(password) < 8:
            raise ValidationException("Senha deve ter no mínimo 8 caracteres")

    async def apply(
        self,
        full_name: str,
        cpf: str,
        email: str,
        phone: str,
        city: str,
        state: str,
        salary_expectation: str,
        desired_contract_type: str,
        works_at_marajo_group: bool,
        job_id: UUID | None,
        file_bytes: bytes,
        file_name: str,
        password: str,
        file_content_type: str | None = None,
        lgpd_consent: bool = False,
    ) -> PublicApplyResponse:
        """
        Processo completo de candidatura pública:
        1. Valida LGPD consent (obrigatório)
        2. Valida CPF (mod-11)
        3. Verifica duplicidade CPF → 409
        4. Verifica duplicidade email → 409
        5. Cria candidato
        6. Faz upload de currículo
        7. Se job_id: cria pipeline entry (sem análise IA)
        8. Se sem job_id: candidato fica em "Aguardando vaga"
        """

        # 1. Validar LGPD consent
        if not lgpd_consent:
            raise ValidationException("É necessário aceitar os termos de LGPD para continuar")

        # 2. Validar CPF
        cpf_clean = self._validate_cpf(cpf)
        self._validate_password(password)

        existing_by_cpf = await self._candidate_repo.find_active_by_cpf(cpf_clean)

        email_clean = email.lower().strip()
        existing_by_email = await self._candidate_repo.find_active_by_email(email_clean)

        existing_candidate: CandidateModel | None = None
        if existing_by_cpf and existing_by_email and existing_by_cpf.id != existing_by_email.id:
            raise PublicApplicationExistingAccountError(
                "Já existe um cadastro com este e-mail ou CPF. Faça login para continuar sua candidatura."
            )
        if existing_by_cpf or existing_by_email:
            existing_candidate = existing_by_cpf or existing_by_email
            assert existing_candidate is not None
            if not existing_candidate.password_hash or not verify_password(password, existing_candidate.password_hash):
                raise PublicApplicationExistingAccountError(
                    "Já existe um cadastro com este e-mail ou CPF. Faça login para continuar sua candidatura."
                )

            existing_active = await self._pipeline_repo.find_active_entry_by_candidate(existing_candidate.id)
            if existing_active is not None:
                raise PublicApplicationDuplicateJobError(
                    "Você já possui uma candidatura em andamento. Acompanhe pelo portal."
                )

        # 4. Validar telefone
        phone_clean = self._validate_phone(phone)

        # 5. Validar arquivo
        try:
            self._validate_pdf_upload(file_name, file_content_type, file_bytes)
        except PublicApplicationFileError as e:
            logger.warning("invalid_file_upload", reason=str(e), file_name=file_name, file_size=len(file_bytes))
            raise

        # 6. Validar vaga (se informada)
        job_model: JobModel | None = None
        if job_id:
            job_model = await self._job_repo.find_active_by_id(job_id)
            if not job_model or job_model.status != "published" or job_model.deleted_at:
                logger.info("unavailable_job_accessed", job_id=str(job_id))
                raise PublicApplicationJobUnavailableError(
                    "Esta vaga não está mais disponível"
                )

        created_new_candidate = existing_candidate is None
        if created_new_candidate:
            candidate_request = CreateCandidateRequest(
                full_name=full_name.strip(),
                email=email_clean,
                phone=phone_clean,
                cpf=cpf_clean,
                location_city=city.strip(),
                location_state=state.strip().upper(),
                location_country="BR",
            )

            candidate = await self._candidate_service.create(
                candidate_request,
                SYSTEM_USER_ID,
                application_source=APPLICATION_SOURCE_PUBLIC,
            )
            candidate.password_hash = hash_password(password)
            candidate.password_created_at = datetime.now(UTC)
            logger.info(
                "candidate_created",
                candidate_id=str(candidate.id),
                source="public_application",
                application_source=APPLICATION_SOURCE_PUBLIC,
                contract_type=desired_contract_type,
            )
        else:
            candidate = existing_candidate
            assert candidate is not None
            candidate.full_name = full_name.strip()
            candidate.email = email_clean
            candidate.phone = phone_clean
            candidate.location_city = city.strip()
            candidate.location_state = state.strip().upper()
            candidate.application_source = APPLICATION_SOURCE_PUBLIC
            logger.info(
                "candidate_reapplication_authenticated",
                candidate_id=str(candidate.id),
                source="public_application",
            )

        candidate.lgpd_consent_at = datetime.now(UTC)
        candidate.lgpd_consent_version = "1.0"
        candidate.desired_contract_type = desired_contract_type
        candidate.salary_expectation = salary_expectation
        candidate.works_at_marajo_group = works_at_marajo_group
        await self.db.flush()

        # 8. Criar resume + upload
        resume_id = uuid4()
        resume = await self._resume_repo.create_resume(
            ResumeModel(
                id=resume_id,
                candidate_id=candidate.id,
                title="Currículo - Candidatura Pública",
                status="active",
                current_version=1,
                created_by=SYSTEM_USER_ID,
            )
        )

        version_id = uuid4()
        s3_key = f"resumes/{candidate.id}/{resume_id}/v1_original.pdf"
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
                uploaded_by=SYSTEM_USER_ID,
                uploaded_at=datetime.now(UTC),
            )
        )

        # Escrever arquivo no storage
        write_resume_file(version.s3_key, file_bytes)

        # Enfileirar extração
        enqueue_resume_extraction(version.id)

        logger.info(
            "resume_uploaded",
            candidate_id=str(candidate.id),
            version_id=str(version.id),
            file_size=len(file_bytes),
        )

        # 9. Criar pipeline entry se vaga informada
        status = "awaiting_job"
        pipeline_id: UUID | None = None
        analysis_auto_requested = False
        analysis_id: UUID | None = None
        analysis_status: str | None = None
        if job_model:
            now = datetime.now(UTC)
            existing_entry = await self._pipeline_repo.find_any_entry(candidate.id, job_id)
            if existing_entry is not None:
                reactivated_pipeline = await self._pipeline_repo.reactivate_entry(
                    candidate_id=candidate.id,
                    job_id=job_id,
                    stage="entry",
                    status="active",
                    moved_by=SYSTEM_USER_ID,
                    updated_at=now,
                )
                if reactivated_pipeline is None:
                    raise PublicApplicationDuplicateJobError(
                        "Não foi possível reabrir sua candidatura agora. Tente novamente."
                    )
                pipeline_id = _candidate_job_pipeline_key(candidate_id=candidate.id, job_id=job_id)
                await self._pipeline_repo.save_transition(
                    CandidateJobPipelineEventModel(
                        candidate_id=candidate.id,
                        job_id=job_id,
                        event_type="candidate_reapplied",
                        from_stage=existing_entry.pipeline_stage,
                        to_stage="entry",
                        actor_id=SYSTEM_USER_ID,
                        idempotency_key=f"public-reapply:{pipeline_id}:{version.id}",
                        metadata_payload={
                            "trigger": "public_application",
                            "reason": "public_reapplication",
                            "origin": "public_reapplication",
                            "resume_version_id": str(version.id),
                        },
                        created_at=now,
                    )
                )
                logger.info(
                    "pipeline_entry_reactivated",
                    candidate_id=str(candidate.id),
                    job_id=str(job_id),
                    pipeline_id=str(pipeline_id),
                    reason="public_reapplication",
                )
            else:
                created_pipeline = await self._pipeline_repo.create_entry(
                    candidate_id=candidate.id,
                    job_id=job_id,
                    stage="entry",
                    status="active",
                    moved_by=SYSTEM_USER_ID,
                    updated_at=now,
                    resume_version_id=version.id,
                )
                pipeline_id = created_pipeline.get("pipeline_id")
                logger.info(
                    "pipeline_entry_created",
                    candidate_id=str(candidate.id),
                    job_id=str(job_id),
                    stage="entry",
                    pipeline_id=str(pipeline_id) if pipeline_id else None,
                )
            status = "entered_pipeline"
            await BehavioralAssignmentService(
                SQLAlchemyBehavioralAssignmentRepository(self.db)
            ).ensure_assignment_for_application(
                candidate_id=candidate.id,
                job_id=job_id,
                template_id=job_model.behavioral_template_id,
            )

            try:
                analysis_result = await RequestAnalysisUseCase(
                    SQLAlchemyAnalysisRepository(self.db),
                    self._resume_repo,
                ).execute(
                    RequestAnalysisCommand(
                        resume_version_id=version.id,
                        requested_by=SYSTEM_USER_ID,
                        job_id=job_id,
                        priority=5,
                        allow_pending_resume_extraction=True,
                    )
                )
                analysis_id = analysis_result.analysis_id
                analysis_status = str(analysis_result.status)
                analysis_auto_requested = True
                await self._pipeline_repo.attach_analysis_to_entry(
                    candidate_id=candidate.id,
                    job_id=job_id,
                    resume_version_id=version.id,
                    analysis_id=analysis_result.analysis_id,
                    updated_at=now,
                )
                logger.info(
                    "public_application.analysis_auto_requested",
                    candidate_id=str(candidate.id),
                    job_id=str(job_id),
                    resume_version_id=str(version.id),
                    analysis_id=str(analysis_result.analysis_id),
                    analysis_status=analysis_status,
                )
            except Exception as exc:
                logger.warning(
                    "public_application.analysis_auto_request_failed",
                    candidate_id=str(candidate.id),
                    job_id=str(job_id),
                    resume_version_id=str(version.id),
                    error=str(exc),
                )

        return PublicApplyResponse(
            candidate_id=candidate.id,
            resume_id=resume.id,
            resume_version_id=version.id,
            job_id=job_id,
            pipeline_id=pipeline_id,
            analysis_auto_requested=analysis_auto_requested,
            analysis_id=analysis_id,
            analysis_status=analysis_status,
            talent_pool=job_id is None,
            talent_pool_profile_status=version.extraction_status if job_id is None else None,
            portal_access_hint="Use o portal do candidato para acompanhar sua candidatura.",
            status=status,
            message="Candidatura enviada com sucesso! Nossa equipe entrará em contato em breve.",
        )
