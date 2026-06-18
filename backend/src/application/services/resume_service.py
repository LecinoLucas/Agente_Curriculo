from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID, uuid4

from src.application.services.upload_validation_service import (
    UploadValidationError,
    ValidatedUpload,
    resume_upload_policy,
    validate_upload,
)
from src.core.settings import settings
from src.domain.entities.user import User
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.infrastructure.storage.resume_files import resolve_resume_storage_path, write_resume_file
from src.interface.api.schemas.resume_schemas import UpdateResumeRequest


class ResumeNotFoundError(Exception):
    pass


class ResumeUploadCandidateNotFoundError(Exception):
    pass


class ResumeUploadCandidateRequiredError(Exception):
    pass


class InvalidResumeTextError(Exception):
    pass


class InvalidResumeFileError(Exception):
    pass


class ExtractionFileNotFoundError(Exception):
    pass


class ExtractionAlreadyProcessingError(Exception):
    pass


MAX_PDF_UPLOAD_BYTES = settings.max_upload_size_bytes

_RETRY_STALE_SECONDS = 300  # matches _STUCK_THRESHOLD_SECONDS in cleanup task


@dataclass(frozen=True)
class ResumeUpload:
    resume: ResumeModel
    version: ResumeVersionModel
    upload_url: str
    upload_fields: dict[str, str]


@dataclass(frozen=True)
class ResumeFileUpload:
    resume: ResumeModel
    version: ResumeVersionModel
    candidate: CandidateModel
    prefilled_fields: list[str]


@dataclass(frozen=True)
class ResumeDetails:
    resume: ResumeModel
    versions: list[ResumeVersionModel]


@dataclass(frozen=True)
class ResumeExtractionStatus:
    resume: ResumeModel
    version: ResumeVersionModel


@dataclass(frozen=True)
class ExtractionRetryResult:
    resume: ResumeModel
    version: ResumeVersionModel
    queued: bool
    can_retry: bool
    message: str


def extraction_retry_eligibility(
    version: ResumeVersionModel,
) -> tuple[bool, str | None, str]:
    """Return (can_retry, reason, status_label) for a resume version ORM object."""
    return extraction_retry_eligibility_from_values(
        extraction_status=version.extraction_status,
        uploaded_at=version.uploaded_at,
        word_count=version.word_count,
    )


def extraction_retry_eligibility_from_values(
    *,
    extraction_status: str | None,
    uploaded_at: datetime,
    word_count: int | None,
) -> tuple[bool, str | None, str]:
    """Return (can_retry, reason, status_label) from plain field values.

    Uses word_count as the canonical signal for whether a completed extraction
    produced usable content (word_count is always populated when extracted_text is).
    """
    if extraction_status is None:
        return False, None, "Sem arquivo"

    if uploaded_at.tzinfo is None:
        uploaded_at = uploaded_at.replace(tzinfo=UTC)
    age = (datetime.now(UTC) - uploaded_at).total_seconds()

    if extraction_status == "failed":
        return True, "extraction_failed", "Falha na extração"
    if extraction_status == "processing":
        if age > _RETRY_STALE_SECONDS:
            return True, "extraction_stuck", "Extração travada"
        return False, None, "Extraindo..."
    if extraction_status == "pending":
        if age > _RETRY_STALE_SECONDS:
            return True, "extraction_stale_pending", "Extração pendente"
        return False, None, "Na fila"
    if extraction_status == "completed":
        if (word_count or 0) == 0:
            return True, "extraction_empty", "Extração vazia"
        return False, None, "Extraído"
    return False, None, extraction_status


class ResumeService:
    def __init__(self, repository: SQLAlchemyResumeRepository) -> None:
        self._repository = repository

    async def list_summaries(self, current_user: User, page: int = 1, page_size: int = 20) -> tuple[list[dict], int]:
        """
        List resumes filtered by user role.

        Access Control:
        ───────────────
        - ADMIN/RECRUITER/VIEWER: Returns all resumes
        - role="candidate": Returns only resumes for Candidate linked to this user (via user_id)

        Candidate Portal Access:
        ────────────────────────
        If current_user.role == "candidate", this method implements candidate portal access
        by finding the Candidate where user_id = current_user.id.
        """
        limit = page_size
        offset = (page - 1) * page_size

        if self._can_manage_all(current_user):
            # Internal user (recruiter/admin/viewer): access all resumes
            total = await self._repository.count_summaries()
            items = await self._repository.list_summaries(limit=limit, offset=offset)
            return items, total

        candidate = await self._repository.find_candidate_by_user_id(current_user.id)
        if candidate is None:
            # User with role="candidate" should always have linked Candidate
            return [], 0

        total = await self._repository.count_summaries(candidate.id)
        items = await self._repository.list_summaries(candidate.id, limit=limit, offset=offset)
        return items, total

    async def initiate_dev_upload(
        self,
        current_user: User,
        candidate_id: UUID | None = None,
    ) -> ResumeUpload:
        candidate = await self._resolve_upload_candidate(current_user, candidate_id)

        resume = await self._repository.create_resume(
            ResumeModel(
                candidate_id=candidate.id,
                title="Currículo principal",
                status="active",
                current_version=1,
                created_by=current_user.id,
            )
        )

        version_id = uuid4()
        s3_key = f"resumes/{candidate.id}/{resume.id}/v1_original.pdf"
        version = await self._repository.create_version(
            ResumeVersionModel(
                id=version_id,
                resume_id=resume.id,
                version_number=1,
                s3_bucket="resume-ai-dev-uploads",
                s3_key=s3_key,
                original_file_name=f"resume-{version_id}.pdf",
                file_size_bytes=0,
                file_hash_sha256=sha256(str(version_id).encode("utf-8")).hexdigest(),
                mime_type="application/pdf",
                extraction_status="pending",
                uploaded_by=current_user.id,
            )
        )

        return ResumeUpload(
            resume=resume,
            version=version,
            upload_url=f"https://upload.local/resumes/{version_id}",
            upload_fields={"key": s3_key, "Content-Type": "application/pdf"},
        )

    async def get_details(self, resume_id: UUID, current_user: User) -> ResumeDetails:
        resume = await self._get_authorized_resume(resume_id, current_user)
        versions = await self._repository.list_versions(resume.id)
        return ResumeDetails(resume=resume, versions=versions)

    async def get_extraction_status(
        self,
        resume_id: UUID,
        current_user: User,
    ) -> ResumeExtractionStatus:
        resume = await self._get_authorized_resume(resume_id, current_user)
        version = await self._repository.find_version(resume.id, resume.current_version)
        if version is None:
            raise ResumeNotFoundError
        return ResumeExtractionStatus(resume=resume, version=version)

    async def upload_pdf(
        self,
        resume_id: UUID,
        *,
        file_name: str,
        content_type: str | None,
        content: bytes,
        current_user: User,
    ) -> ResumeFileUpload:
        resume = await self._get_authorized_resume(resume_id, current_user)
        validated_file = self._validate_pdf_upload(file_name, content_type, content)
        file_name = validated_file.file_name
        content = validated_file.content
        content_type = validated_file.mime_type

        version = await self._repository.find_version(resume.id, resume.current_version)
        if version is None:
            raise ResumeNotFoundError
        candidate = await self._repository.find_candidate_by_id(resume.candidate_id)
        if candidate is None:
            raise ResumeNotFoundError

        now = datetime.now(UTC)
        version.original_file_name = file_name
        version.file_size_bytes = len(content)
        version.file_hash_sha256 = sha256(content).hexdigest()
        version.mime_type = content_type
        version.extracted_text = None
        version.extraction_status = "pending"
        version.extraction_error = None
        version.page_count = None
        version.word_count = None
        version.uploaded_by = current_user.id
        version.uploaded_at = now
        write_resume_file(version.s3_key, content)

        resume.updated_at = now
        await self._repository.save_version(version)
        await self._repository.save_resume(resume)
        return ResumeFileUpload(
            resume=resume,
            version=version,
            candidate=candidate,
            prefilled_fields=[],
        )

    async def retry_extraction(
        self,
        resume_id: UUID,
        current_user: User,
    ) -> ExtractionRetryResult:
        resume = await self._get_authorized_resume(resume_id, current_user)
        version = await self._repository.find_version(resume.id, resume.current_version)
        if version is None:
            raise ResumeNotFoundError

        file_path = resolve_resume_storage_path(version.s3_key)
        if not file_path.exists():
            raise ExtractionFileNotFoundError

        can_retry, reason, _label = extraction_retry_eligibility(version)

        status = version.extraction_status
        uploaded_at = version.uploaded_at
        if uploaded_at.tzinfo is None:
            uploaded_at = uploaded_at.replace(tzinfo=UTC)
        age = (datetime.now(UTC) - uploaded_at).total_seconds()

        if status == "processing" and age <= _RETRY_STALE_SECONDS:
            raise ExtractionAlreadyProcessingError

        if not can_retry:
            if status == "completed":
                return ExtractionRetryResult(
                    resume=resume,
                    version=version,
                    queued=False,
                    can_retry=False,
                    message="Extração já concluída com sucesso.",
                )
            return ExtractionRetryResult(
                resume=resume,
                version=version,
                queued=False,
                can_retry=False,
                message="Extração já está na fila, aguardando processamento.",
            )

        version.extraction_status = "pending"
        version.extraction_error = None
        resume.updated_at = datetime.now(UTC)
        await self._repository.save_version(version)
        await self._repository.save_resume(resume)

        return ExtractionRetryResult(
            resume=resume,
            version=version,
            queued=True,
            can_retry=True,
            message="Extração reenfileirada. Aguarde o processamento.",
        )

    async def update(
        self,
        resume_id: UUID,
        body: UpdateResumeRequest,
        current_user: User,
    ) -> ResumeModel:
        resume = await self._get_authorized_resume(resume_id, current_user)

        if body.title is not None:
            resume.title = self._clean_required_text(body.title)
        if body.status is not None:
            resume.status = body.status

        resume.updated_at = datetime.now(UTC)
        return await self._repository.save_resume(resume)

    async def set_status(self, resume_id: UUID, status: str, current_user: User) -> ResumeModel:
        resume = await self._get_authorized_resume(resume_id, current_user)
        resume.status = status
        resume.updated_at = datetime.now(UTC)
        return await self._repository.save_resume(resume)

    async def soft_delete(self, resume_id: UUID, current_user: User) -> None:
        resume = await self._get_authorized_resume(resume_id, current_user)
        now = datetime.now(UTC)
        resume.status = "deleted"
        resume.deleted_at = now
        resume.updated_at = now
        await self._repository.save_resume(resume)

    async def _get_authorized_resume(self, resume_id: UUID, current_user: User) -> ResumeModel:
        resume = await self._repository.find_active_resume_by_id(resume_id)
        if resume is None:
            raise ResumeNotFoundError

        if self._can_manage_all(current_user):
            return resume

        candidate = await self._repository.find_candidate_by_user_id(current_user.id)
        if candidate is None or resume.candidate_id != candidate.id:
            raise ResumeNotFoundError
        return resume

    @staticmethod
    def _can_manage_all(user: User) -> bool:
        return user.role.value in {"admin", "recruiter"}

    async def _resolve_upload_candidate(
        self,
        current_user: User,
        candidate_id: UUID | None,
    ) -> CandidateModel:
        """
        Resolve which Candidate should receive the resume upload.

        Access Control:
        ───────────────
        - ADMIN/RECRUITER: Must explicitly provide candidate_id
        - role="candidate": Can upload for own linked Candidate (via Candidate.user_id)

        role="candidate" CANNOT auto-create Candidate. This prevents mixing Candidate
        creation logic into portal access flow. Candidates are created only by
        admin/recruiter via POST /candidates endpoint.
        """
        if candidate_id is not None:
            candidate = await self._repository.find_candidate_by_id(candidate_id)
            if candidate is None:
                raise ResumeUploadCandidateNotFoundError

            if self._can_manage_all(current_user):
                # Internal user (recruiter/admin): can upload for any candidate
                return candidate

            # Portal access (role="candidate"): can only upload for own candidate
            owner_candidate = await self._repository.find_candidate_by_user_id(current_user.id)
            if owner_candidate is None or owner_candidate.id != candidate_id:
                raise ResumeUploadCandidateNotFoundError
            return candidate

        # No candidate_id provided
        if self._can_manage_all(current_user):
            # Internal user MUST provide candidate_id
            raise ResumeUploadCandidateRequiredError

        # Portal access (role="candidate"): try to find own candidate
        candidate = await self._repository.find_candidate_by_user_id(current_user.id)
        if candidate is not None:
            # GUARDRAIL: role="candidate" can use existing linked Candidate only
            return candidate

        # GUARDRAIL: role="candidate" CANNOT auto-create Candidate
        # Candidates are created only by admin/recruiter via POST /candidates
        raise ResumeUploadCandidateRequiredError(
            "User com role=candidate não tem Candidate vinculado. "
            "Solicite ao recrutador para criar ou vincular um candidato."
        )

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidResumeTextError
        return cleaned

    @staticmethod
    def _validate_pdf_upload(file_name: str, content_type: str | None, content: bytes) -> ValidatedUpload:
        try:
            return validate_upload(
                file_name=file_name,
                content_type=content_type,
                content=content,
                policy=resume_upload_policy(),
            )
        except UploadValidationError as exc:
            raise InvalidResumeFileError(str(exc)) from exc

    @classmethod
    def _apply_candidate_prefill(cls, candidate: CandidateModel, prefill) -> list[str]:
        updated_fields: list[str] = []

        if not candidate.email and prefill.email:
            candidate.email = cls._clean_email(prefill.email)
            updated_fields.append("email")
        if not candidate.phone and prefill.phone:
            candidate.phone = prefill.phone
            updated_fields.append("phone")
        if not candidate.location_city and prefill.location_city:
            candidate.location_city = prefill.location_city
            updated_fields.append("location_city")
        if not candidate.location_state and prefill.location_state:
            candidate.location_state = prefill.location_state
            updated_fields.append("location_state")
        if candidate.location_country == "BR" and prefill.location_country and (
            prefill.location_city or prefill.location_state
        ):
            candidate.location_country = prefill.location_country
            updated_fields.append("location_country")
        if not candidate.linkedin_url and prefill.linkedin_url:
            candidate.linkedin_url = prefill.linkedin_url
            updated_fields.append("linkedin_url")
        if not candidate.github_url and prefill.github_url:
            candidate.github_url = prefill.github_url
            updated_fields.append("github_url")
        if not candidate.portfolio_url and prefill.portfolio_url:
            candidate.portfolio_url = prefill.portfolio_url
            updated_fields.append("portfolio_url")

        merged_tags = cls._clean_tags([*(candidate.tags or []), *(prefill.tags or [])])
        if merged_tags != (candidate.tags or []):
            candidate.tags = merged_tags
            updated_fields.append("tags")

        auto_notes_parts = []
        if prefill.headline:
            auto_notes_parts.append(f"Título detectado no currículo: {prefill.headline}")
        if prefill.full_name and prefill.full_name.lower() != candidate.full_name.lower():
            auto_notes_parts.append(f"Nome detectado no currículo: {prefill.full_name}")
        if auto_notes_parts:
            auto_block = "[AUTO-PRECADASTRO] " + " | ".join(auto_notes_parts)
            existing_notes = (candidate.internal_notes or "").strip()
            if auto_block not in existing_notes:
                candidate.internal_notes = (
                    f"{existing_notes}\n{auto_block}".strip()
                    if existing_notes
                    else auto_block
                )
                updated_fields.append("internal_notes")

        return updated_fields

    @staticmethod
    def _clean_tags(tags: list[str]) -> list[str]:
        return sorted({tag.lower().strip() for tag in tags if tag and tag.strip()})

    @staticmethod
    def _clean_email(email: str | None) -> str | None:
        return email.lower().strip() if email else None
