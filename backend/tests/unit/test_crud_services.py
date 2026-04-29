from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest

from src.application.services.candidate_service import CandidateEmailConflictError, CandidateService
from src.application.services.job_service import InvalidJobSalaryRangeError, JobService
from src.application.services.skill_service import SkillNameConflictError, SkillService
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, SkillModel
from src.interface.api.schemas.candidate_schemas import CreateCandidateRequest
from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest
from src.interface.api.schemas.skill_schemas import CreateSkillRequest


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


class FakeSkillRepository:
    def __init__(self) -> None:
        self.by_name: dict[str, SkillModel] = {}
        self.saved: SkillModel | None = None

    async def find_active_by_normalized_name(self, normalized_name: str) -> SkillModel | None:
        return self.by_name.get(normalized_name)

    async def create(self, skill: SkillModel) -> SkillModel:
        skill.id = uuid4()
        skill.created_at = datetime.now(timezone.utc)
        skill.updated_at = skill.created_at
        self.saved = skill
        self.by_name[skill.normalized_name] = skill
        return skill


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
            "ai_status": "completed",
            "ai_score": Decimal("87.5"),
        }
    ]
    service = CandidateService(repo)  # type: ignore[arg-type]

    items, total = await service.list_summaries(1, 20)

    assert total == 1
    assert items[0].linked_job_count == 3


@pytest.mark.asyncio
async def test_skill_create_rejects_duplicate_normalized_name():
    repo = FakeSkillRepository()
    repo.by_name["python"] = SkillModel(id=uuid4(), name="Python", normalized_name="python", aliases=[])
    service = SkillService(repo)  # type: ignore[arg-type]

    with pytest.raises(SkillNameConflictError):
        await service.create(CreateSkillRequest(name="  Python  "))


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
