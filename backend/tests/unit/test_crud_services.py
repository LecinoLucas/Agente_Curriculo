from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.application.services.candidate_service import CandidateDeleteSummary, CandidateEmailConflictError, CandidateService
from src.application.services.job_service import InvalidJobSalaryRangeError, JobService
from src.domain.entities.user import User, UserRole, UserStatus
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.interface.api.schemas.candidate_schemas import CreateCandidateRequest
from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest


class FakeCandidateRepository:
    def __init__(self) -> None:
        self.by_email: dict[str, CandidateModel] = {}
        self.saved: CandidateModel | None = None
        self.summary_rows: list[dict] = []

    async def find_active_by_email(self, email: str) -> CandidateModel | None:
        return self.by_email.get(email)

    async def create(self, candidate: CandidateModel) -> CandidateModel:
        candidate.id = uuid4()
        candidate.created_at = datetime.now(timezone.utc)
        candidate.updated_at = candidate.created_at
        self.saved = candidate
        if candidate.email:
            self.by_email[candidate.email] = candidate
        return candidate

    async def list_summaries(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
        has_resume: bool | None = None,
        ai_status_filter: list[str] | None = None,
    ) -> tuple[list[dict], int]:
        return self.summary_rows, len(self.summary_rows)

    async def find_active_by_id(self, candidate_id):
        return self.saved if self.saved and self.saved.id == candidate_id else None

    async def get_delete_summary(self, candidate_id):
        return CandidateDeleteSummary(
            linked_jobs_count=0,
            analyses_count=0,
            resume_s3_keys=(),
            candidate_document_paths=(),
            has_final_decision=False,
            has_hiring_record=False,
        )

    async def hard_delete(self, candidate_id):
        self.deleted_id = candidate_id


class FakeJobRepository:
    def __init__(self, job: JobModel) -> None:
        self.job = job

    async def find_active_by_id(self, job_id):
        return self.job if self.job.id == job_id else None

    async def create(self, job: JobModel) -> JobModel:
        job.id = uuid4()
        job.created_at = datetime.now(timezone.utc)
        job.updated_at = job.created_at
        self.job = job
        return job

    async def save(self, job: JobModel) -> JobModel:
        self.job = job
        return job


@pytest.mark.asyncio
async def test_candidate_create_normalizes_email_and_tags():
    repo = FakeCandidateRepository()
    service = CandidateService(repo)  # type: ignore[arg-type]

    candidate = await service.create(
        CreateCandidateRequest(
            full_name="  Ana Silva  ",
            email="ANA@EXAMPLE.COM",
            tags=[" Python ", "python", " Backend "],
        ),
        created_by=uuid4(),
    )

    assert candidate.full_name == "Ana Silva"
    assert candidate.email == "ana@example.com"
    assert candidate.tags == ["backend", "python"]


@pytest.mark.asyncio
async def test_candidate_create_rejects_duplicate_email():
    repo = FakeCandidateRepository()
    repo.by_email["ana@example.com"] = CandidateModel(
        id=uuid4(),
        full_name="Ana",
        email="ana@example.com",
        tags=[],
        created_by=uuid4(),
    )
    service = CandidateService(repo)  # type: ignore[arg-type]

    with pytest.raises(CandidateEmailConflictError):
        await service.create(
            CreateCandidateRequest(full_name="Ana Silva", email="ANA@EXAMPLE.COM"),
            created_by=uuid4(),
        )


@pytest.mark.asyncio
async def test_candidate_list_summaries_includes_linked_job_count():
    repo = FakeCandidateRepository()
    repo.summary_rows = [
        {
            "id": uuid4(),
            "full_name": "Ana Silva",
            "email": "ana@example.com",
            "phone": None,
            "cpf": None,
            "tags": [],
            "created_at": datetime.now(timezone.utc),
            "resume_count": 2,
            "linked_job_count": 3,
            "active_job_id": None,
            "active_job_title": None,
            "active_job_stage": None,
            "active_job_final_score": None,
            "ai_status": "completed",
        }
    ]
    service = CandidateService(repo)  # type: ignore[arg-type]

    items, total = await service.list_summaries(1, 20)

    assert total == 1
    assert items[0].linked_job_count == 3


@pytest.mark.asyncio
async def test_candidate_hard_delete_continues_when_audit_fails():
    class _NestedTransaction:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    repo = FakeCandidateRepository()
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Ana Silva",
        email="ana@example.com",
        tags=[],
        created_by=uuid4(),
    )
    repo.saved = candidate
    actor = User(
        id=uuid4(),
        email="admin@example.com",
        password_hash="hash",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
        full_name="Admin",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    audit_session = MagicMock()
    audit_session.begin_nested.return_value = _NestedTransaction()
    failing_audit = AsyncMock()
    failing_audit._session = audit_session
    failing_audit.log_event = AsyncMock(side_effect=RuntimeError("audit down"))

    service = CandidateService(repo, audit_service=failing_audit)  # type: ignore[arg-type]

    with patch("src.application.services.candidate_service.logger.warning") as warning_mock:
        await service.hard_delete(
            candidate.id,
            actor=actor,
            reason="duplicate",
            note="merge manual",
            confirmation="EXCLUIR",
        )

    assert repo.deleted_id == candidate.id
    audit_session.begin_nested.assert_called_once_with()
    failing_audit.log_event.assert_awaited_once()
    warning_mock.assert_called_once_with(
        "candidate_delete_audit_log_failed",
        action="delete_candidate",
        candidate_id=str(candidate.id),
        actor_id=str(actor.id),
        error="audit down",
    )


@pytest.mark.asyncio
async def test_job_partial_salary_update_validates_against_existing_value():
    job = JobModel(
        id=uuid4(),
        title="Backend",
        description="Backend role",
        salary_min=Decimal("10000.00"),
        salary_max=Decimal("12000.00"),
        salary_currency="BRL",
        status="draft",
        created_by=uuid4(),
    )
    service = JobService(FakeJobRepository(job))  # type: ignore[arg-type]

    with pytest.raises(InvalidJobSalaryRangeError):
        await service.update(job.id, UpdateJobRequest(salary_min=Decimal("13000.00")))


@pytest.mark.asyncio
async def test_job_create_trims_required_text_and_uppercases_currency():
    service = JobService(FakeJobRepository(JobModel(id=uuid4(), title="", description="", created_by=uuid4())))  # type: ignore[arg-type]

    job = await service.create(
        CreateJobRequest(
            title="  Backend Engineer  ",
            description="  Build APIs and services  ",
            salary_currency="usd",
        ),
        created_by=uuid4(),
    )

    assert job.title == "Backend Engineer"
    assert job.description == "Build APIs and services"
    assert job.salary_currency == "USD"


@pytest.mark.asyncio
async def test_job_update_allows_clearing_optional_fields_when_explicitly_sent():
    job = JobModel(
        id=uuid4(),
        title="Backend",
        description="Backend role",
        requirements="Python and FastAPI",
        status="draft",
        seniority_level="senior",
        minimum_education_level="bachelor",
        minimum_years_experience=Decimal("5.0"),
        deal_breakers=[{"field": "location", "operator": "equals", "value": "São Paulo", "reason": "Presencial", "is_active": True}],
        work_model="remote",
        location="São Paulo",
        salary_min=Decimal("10000.00"),
        salary_max=Decimal("15000.00"),
        salary_currency="BRL",
        created_by=uuid4(),
    )
    service = JobService(FakeJobRepository(job))  # type: ignore[arg-type]

    updated = await service.update(
        job.id,
        UpdateJobRequest(
            requirements=None,
            seniority_level=None,
            minimum_education_level=None,
            minimum_years_experience=None,
            deal_breakers=[],
            work_model=None,
            location=None,
            salary_min=None,
            salary_max=None,
        ),
    )

    assert updated.requirements is None
    assert updated.seniority_level is None
    assert updated.minimum_education_level is None
    assert updated.minimum_years_experience is None
    assert updated.deal_breakers == []
    assert updated.work_model is None
    assert updated.location is None
    assert updated.salary_min is None
    assert updated.salary_max is None
