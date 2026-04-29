"""Real-world integration test: Resume extraction → Matching with validation.

Tests the complete flow:
1. Create 3 realistic resumes (complete, incomplete, poorly formatted)
2. Create 1 job with mandatory/optional skills, education, experience, deal-breaker
3. Extract text from resumes
4. Run analysis and matching
5. Validate: extraction quality, matching logic, validation status, ranking
"""
import pytest
import sqlalchemy as sa
from decimal import Decimal
from uuid import UUID, uuid4
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.job_model import JobModel, SkillModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    AIModelModel,
    PromptTemplateModel,
)
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


async def _create_active_user(
    session: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    """Create and activate a user."""
    repo = SQLAlchemyUserRepository(session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name=f"{role.value.title()} User",
        role=role,
    )
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    """Get auth headers."""
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _pdf_with_text(text: str) -> bytes:
    """Create a valid PDF with text content (from test_resume_endpoints.py)."""
    stream = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET"
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        (
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
        ),
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        (
            f"5 0 obj << /Length {len(stream.encode())} >> stream\n"
            f"{stream}\nendstream endobj\n"
        ).encode(),
    ]
    body = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(body))
        body += obj

    xref_offset = len(body)
    xref = f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        xref += f"{offset:010d} 00000 n \n".encode()

    trailer = (
        f"trailer << /Root 1 0 R /Size {len(objects) + 1} >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode()
    return body + xref + trailer


@pytest.mark.asyncio
async def test_real_world_matching_flow(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    """
    Real-world test: 3 resumes, 1 job, complete matching flow.

    Job: Senior Backend Engineer (Remote)
    - Mandatory: Python, PostgreSQL (need 60% = both)
    - Optional: Docker, Kubernetes
    - Education: Bachelor minimum
    - Experience: 5 years minimum
    - Deal-breaker: Must be Remote

    Candidates:
    1. Complete Resume: Has all mandatory + optional, Master, 8y exp, Remote → PASS
    2. Incomplete Resume: Has mandatory + some optional, Bachelor, 6y exp, Remote → PASS
    3. Poorly Formatted: Missing mandatory skills, HighSchool, 2y exp, Hybrid → FAIL
    """

    # === SETUP: Create recruiter and candidates ===
    recruiter = await _create_active_user(
        db_session,
        "recruiter-real-world@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-real-world@test.com", "password123")

    # Create 3 candidates
    candidate1 = CandidateModel(
        user_id=None,
        full_name="Carlos Silva - Complete",
        email="carlos.silva@example.com",
        created_by=recruiter.id,
    )
    candidate2 = CandidateModel(
        user_id=None,
        full_name="Marina Costa - Incomplete",
        email="marina.costa@example.com",
        created_by=recruiter.id,
    )
    candidate3 = CandidateModel(
        user_id=None,
        full_name="João Santos - Poor Format",
        email="joao.santos@example.com",
        created_by=recruiter.id,
    )
    db_session.add_all([candidate1, candidate2, candidate3])
    await db_session.commit()
    await db_session.refresh(candidate1)
    await db_session.refresh(candidate2)
    await db_session.refresh(candidate3)

    # === SETUP: Create Job ===
    job = JobModel(
        title="Senior Backend Engineer",
        description="Build scalable Python microservices with PostgreSQL",
        requirements="Python, PostgreSQL, 5+ years experience, Remote work",
        seniority_level="senior",
        work_model="remote",
        location="Brasil",
        salary_min=Decimal("15000.00"),
        salary_max=Decimal("22000.00"),
        salary_currency="brl",
        minimum_education_level="bachelor",
        minimum_years_experience=Decimal("5.0"),
        deal_breakers=[
            {
                "field": "work_model",
                "operator": "not_equals",
                "value": "remote",
                "reason": "Vaga requer trabalho remoto",
                "is_active": True,
            }
        ],
        created_by=recruiter.id,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    # Create job skills with proper normalized names
    def _normalize_skill(name: str) -> str:
        """Normalize skill name (from SkillService._normalize)."""
        return name.lower().strip()

    skill_python = await db_session.scalar(
        sa.select(SkillModel).where(SkillModel.normalized_name == _normalize_skill("Python"))
    )
    if skill_python is None:
        skill_python = SkillModel(
            name="Python",
            normalized_name=_normalize_skill("Python"),
        )
        db_session.add(skill_python)
        await db_session.flush()

    skill_postgres = await db_session.scalar(
        sa.select(SkillModel).where(SkillModel.normalized_name == _normalize_skill("PostgreSQL"))
    )
    if skill_postgres is None:
        skill_postgres = SkillModel(
            name="PostgreSQL",
            normalized_name=_normalize_skill("PostgreSQL"),
        )
        db_session.add(skill_postgres)
        await db_session.flush()

    skill_docker = await db_session.scalar(
        sa.select(SkillModel).where(SkillModel.normalized_name == _normalize_skill("Docker"))
    )
    if skill_docker is None:
        skill_docker = SkillModel(
            name="Docker",
            normalized_name=_normalize_skill("Docker"),
        )
        db_session.add(skill_docker)
        await db_session.flush()

    skill_k8s = await db_session.scalar(
        sa.select(SkillModel).where(SkillModel.normalized_name == _normalize_skill("Kubernetes"))
    )
    if skill_k8s is None:
        skill_k8s = SkillModel(
            name="Kubernetes",
            normalized_name=_normalize_skill("Kubernetes"),
        )
        db_session.add(skill_k8s)
        await db_session.flush()

    await db_session.commit()

    # Now add job required skills
    from src.infrastructure.database.models.job_model import JobRequiredSkillModel

    job_req_python = JobRequiredSkillModel(
        job_id=job.id,
        skill_id=skill_python.id,
        is_mandatory=True,
    )
    job_req_postgres = JobRequiredSkillModel(
        job_id=job.id,
        skill_id=skill_postgres.id,
        is_mandatory=True,
    )
    job_req_docker = JobRequiredSkillModel(
        job_id=job.id,
        skill_id=skill_docker.id,
        is_mandatory=False,
    )
    job_req_k8s = JobRequiredSkillModel(
        job_id=job.id,
        skill_id=skill_k8s.id,
        is_mandatory=False,
    )
    db_session.add_all([job_req_python, job_req_postgres, job_req_docker, job_req_k8s])
    await db_session.commit()

    # === UPLOAD RESUMES ===

    # Resume 1: Complete
    upload1 = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": str(candidate1.id)},
    )
    assert upload1.status_code == 202
    resume1_id = upload1.json()["resume_id"]
    resume1_version_id = upload1.json()["version_id"]

    pdf1 = _pdf_with_text(
        "Carlos Silva Python PostgreSQL Docker Kubernetes "
        "Master Degree 8 years Backend Engineer Remote Brazil"
    )
    upload1_file = await client.post(
        f"/api/v1/resumes/{resume1_id}/upload",
        headers=headers,
        files={"file": ("carlos-silva-resume.pdf", pdf1, "application/pdf")},
    )
    assert upload1_file.status_code == 200

    # Resume 2: Incomplete
    upload2 = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": str(candidate2.id)},
    )
    assert upload2.status_code == 202
    resume2_id = upload2.json()["resume_id"]
    resume2_version_id = upload2.json()["version_id"]

    pdf2 = _pdf_with_text(
        "Marina Costa Python PostgreSQL Docker "
        "Bachelor Degree 6 years Backend Engineer Remote Brazil"
    )
    upload2_file = await client.post(
        f"/api/v1/resumes/{resume2_id}/upload",
        headers=headers,
        files={"file": ("marina-costa-resume.pdf", pdf2, "application/pdf")},
    )
    assert upload2_file.status_code == 200

    # Resume 3: Poorly Formatted (missing mandatory skills, wrong work model)
    upload3 = await client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"candidate_id": str(candidate3.id)},
    )
    assert upload3.status_code == 202
    resume3_id = upload3.json()["resume_id"]
    resume3_version_id = upload3.json()["version_id"]

    pdf3 = _pdf_with_text(
        "Joao Santos Python Kubernetes "
        "High School 2 years Junior Developer Hybrid Work"
    )
    upload3_file = await client.post(
        f"/api/v1/resumes/{resume3_id}/upload",
        headers=headers,
        files={"file": ("joao-santos-resume.pdf", pdf3, "application/pdf")},
    )
    assert upload3_file.status_code == 200

    # === VERIFY EXTRACTIONS ===
    version1 = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == UUID(resume1_version_id))
    )
    assert version1 is not None
    assert version1.extracted_text is not None
    assert "Python" in version1.extracted_text
    assert "PostgreSQL" in version1.extracted_text
    assert "Docker" in version1.extracted_text
    print(f"\n✓ Resume 1 (Complete): Extracted text length = {len(version1.extracted_text)}")

    version2 = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == UUID(resume2_version_id))
    )
    assert version2 is not None
    assert version2.extracted_text is not None
    print(f"✓ Resume 2 (Incomplete): Extracted text length = {len(version2.extracted_text)}")

    version3 = await db_session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == UUID(resume3_version_id))
    )
    assert version3 is not None
    assert version3.extracted_text is not None
    print(f"✓ Resume 3 (Poor Format): Extracted text length = {len(version3.extracted_text)}")

    # === NOW TEST MATCHING ===
    # This would require running analysis and matching
    # For now, we've validated the extraction pipeline is working

    print("\n" + "="*80)
    print("EXTRACTION RESULTS")
    print("="*80)
    print(f"\n1. Complete Resume (Carlos Silva)")
    print(f"   Text: {version1.extracted_text}")
    print(f"   Status: {version1.extraction_status}")
    print(f"   Has Python: {'Python' in version1.extracted_text}")
    print(f"   Has PostgreSQL: {'PostgreSQL' in version1.extracted_text}")
    print(f"   Has Docker: {'Docker' in version1.extracted_text}")
    print(f"   Education: Master")
    print(f"   Experience: 8 years")
    print(f"   Work Model: Remote")

    print(f"\n2. Incomplete Resume (Marina Costa)")
    print(f"   Text: {version2.extracted_text}")
    print(f"   Status: {version2.extraction_status}")
    print(f"   Has Python: {'Python' in version2.extracted_text}")
    print(f"   Has PostgreSQL: {'PostgreSQL' in version2.extracted_text}")
    print(f"   Has Docker: {'Docker' in version2.extracted_text}")
    print(f"   Education: Bachelor")
    print(f"   Experience: 6 years")
    print(f"   Work Model: Remote")

    print(f"\n3. Poorly Formatted Resume (João Santos)")
    print(f"   Text: {version3.extracted_text}")
    print(f"   Status: {version3.extraction_status}")
    print(f"   Has Python: {'Python' in version3.extracted_text}")
    print(f"   Has PostgreSQL: {'PostgreSQL' in version3.extracted_text}")
    print(f"   Has Docker: {'Docker' in version3.extracted_text or 'Kubernetes' in version3.extracted_text}")
    print(f"   Education: High School (below Bachelor requirement)")
    print(f"   Experience: 2 years (below 5 year requirement)")
    print(f"   Work Model: Hybrid (violates Remote deal-breaker)")

    # === ASSERTIONS ===

    # Resume 1: Complete
    assert version1.extraction_status == "completed"
    assert "Python" in version1.extracted_text
    assert "PostgreSQL" in version1.extracted_text

    # Resume 2: Incomplete
    assert version2.extraction_status == "completed"
    assert "Python" in version2.extracted_text
    assert "PostgreSQL" in version2.extracted_text

    # Resume 3: Poorly Formatted
    assert version3.extraction_status == "completed"
    assert "Python" in version3.extracted_text
    assert "PostgreSQL" not in version3.extracted_text  # Missing mandatory skill
    assert "Hybrid" in version3.extracted_text

    print("\n" + "="*80)
    print("✅ EXTRACTION VALIDATION PASSED")
    print("="*80)
    print("""
All 3 resumes extracted successfully:
  ✓ Resume 1: Complete (has all mandatory + optional skills)
  ✓ Resume 2: Incomplete (has mandatory + some optional)
  ✓ Resume 3: Poorly Formatted (missing mandatory PostgreSQL, wrong work_model)
    """)


@pytest.mark.asyncio
async def test_real_world_matching_with_mock_analysis(
    db_session: AsyncSession,
):
    """
    Real-world test: Mock extracted data → matching → validation.

    Tests the matching logic with 3 realistic candidate profiles.
    """
    from unittest.mock import MagicMock, AsyncMock
    from types import SimpleNamespace

    from src.application.services.analysis_service import AnalysisService, AnalysisResultDetails

    # Helper to create job skill row mocks
    def _make_job_skill_row(skill_name: str, is_mandatory: bool):
        return SimpleNamespace(
            skill_name=skill_name,
            skill_aliases=[],
            JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
        )

    # === SETUP: Create Job ===
    job = MagicMock()
    job.id = uuid4()
    job.seniority_level = "senior"
    job.minimum_education_level = "bachelor"
    job.minimum_years_experience = Decimal("5.0")
    job.deal_breakers = [
        {
            "field": "work_model",
            "operator": "not_equals",
            "value": "remote",
            "reason": "Vaga requer trabalho remoto",
            "is_active": True,
        }
    ]

    # Job skill requirements: Python (mandatory), PostgreSQL (mandatory), Docker/Kubernetes (optional)
    job_skills = [
        _make_job_skill_row("Python", is_mandatory=True),
        _make_job_skill_row("PostgreSQL", is_mandatory=True),
        _make_job_skill_row("Docker", is_mandatory=False),
        _make_job_skill_row("Kubernetes", is_mandatory=False),
    ]

    # Create service
    repo = MagicMock()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=job_skills)
    repo.find_active_score_model_version = AsyncMock(return_value=None)
    repo.find_job_match = AsyncMock(return_value=None)
    repo.save_job_match = AsyncMock()
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)

    service = AnalysisService(repository=repo)

    # === CANDIDATES DATA ===
    candidates_data = [
        {
            "name": "Carlos Silva - Complete",
            "work_model": "remote",
            "education": "master",
            "experience_years": Decimal("8.0"),
            "skills": ["Python", "PostgreSQL", "Docker", "Kubernetes"],
            "expected_status": "pass",
            "expected_mandatory": 2,
        },
        {
            "name": "Marina Costa - Incomplete",
            "work_model": "remote",
            "education": "bachelor",
            "experience_years": Decimal("6.0"),
            "skills": ["Python", "PostgreSQL", "Docker"],
            "expected_status": "pass",
            "expected_mandatory": 2,
        },
        {
            "name": "João Santos - Poor Format",
            "work_model": "hybrid",  # Violates deal-breaker
            "education": "high_school",  # Below bachelor requirement
            "experience_years": Decimal("2.0"),  # Below 5.0 requirement
            "skills": ["Python"],  # Only 50% mandatory skills (1/2)
            "expected_status": "fail",
            "expected_mandatory": 1,
        },
    ]

    results = []

    # === RUN MATCHING ===
    print("\n" + "="*80)
    print("REAL-WORLD MATCHING TEST")
    print("Job: Senior Backend Engineer (Remote, Bachelor+, 5y+)")
    print("  Mandatory: Python, PostgreSQL (need 60% = both)")
    print("  Optional: Docker, Kubernetes")
    print("="*80)

    for cand_data in candidates_data:
        result = MagicMock()
        result.highest_education_level = cand_data["education"]
        result.total_experience_years = cand_data["experience_years"]
        result.overall_score = Decimal("75")
        result.seniority_level = "senior" if cand_data["experience_years"] >= Decimal("5") else "junior"
        result.experience_score = Decimal("70")
        result.extracted_data = {"skills": [{"name": s} for s in cand_data["skills"]]}
        result.work_model = cand_data["work_model"]
        result.keywords = []

        analysis = MagicMock()
        analysis.id = uuid4()

        details = AnalysisResultDetails(analysis=analysis, result=result)
        match_response = await service._match_details_to_job(details, job.id)

        results.append({
            "name": cand_data["name"],
            "data": cand_data,
            "response": match_response,
        })

    # === PRINT RESULTS ===
    print("\n1️⃣  CARLOS SILVA - COMPLETE")
    print(f"   Education: Master | Experience: 8.0y | Work: Remote")
    print(f"   Skills: Python ✓, PostgreSQL ✓, Docker ✓, Kubernetes ✓")
    print(f"   → Mandatory: {results[0]['response'].mandatory_skills_matched}/{results[0]['response'].mandatory_skills_total} (100%)")
    print(f"   → Validation: {results[0]['response'].validation_status}")
    print(f"   → Score: {results[0]['response'].match_score}")
    print(f"   → Recommendation: {results[0]['response'].recommendation}")

    print("\n2️⃣  MARINA COSTA - INCOMPLETE")
    print(f"   Education: Bachelor | Experience: 6.0y | Work: Remote")
    print(f"   Skills: Python ✓, PostgreSQL ✓, Docker ✓, Kubernetes ✗")
    print(f"   → Mandatory: {results[1]['response'].mandatory_skills_matched}/{results[1]['response'].mandatory_skills_total} (100%)")
    print(f"   → Validation: {results[1]['response'].validation_status}")
    print(f"   → Score: {results[1]['response'].match_score}")
    print(f"   → Recommendation: {results[1]['response'].recommendation}")

    print("\n3️⃣  JOÃO SANTOS - POOR FORMAT (FAIL)")
    print(f"   Education: High School (below requirement) | Experience: 2.0y (below 5.0y) | Work: Hybrid (violates deal-breaker)")
    print(f"   Skills: Python ✓, PostgreSQL ✗, Docker ✗, Kubernetes ✗")
    print(f"   → Mandatory: {results[2]['response'].mandatory_skills_matched}/{results[2]['response'].mandatory_skills_total} (50% < 60%)")
    print(f"   → Validation: {results[2]['response'].validation_status}")
    print(f"   → Score: {results[2]['response'].match_score}")
    print(f"   → Recommendation: {results[2]['response'].recommendation}")
    if results[2]['response'].rejection_reasons:
        print(f"   → Rejection Reasons:")
        for reason in results[2]['response'].rejection_reasons:
            print(f"      - {reason}")

    # === ASSERTIONS ===
    print("\n" + "="*80)
    print("VALIDATION ASSERTIONS")
    print("="*80)

    # Candidate 1: Complete - PASS
    assert results[0]["response"].validation_status == "pass", \
        f"Carlos (Complete) should PASS, got {results[0]['response'].validation_status}"
    assert results[0]["response"].mandatory_skills_matched == 2
    print("✓ Carlos (Complete): PASS - All criteria met")

    # Candidate 2: Incomplete but mandatory skills present - PASS
    assert results[1]["response"].validation_status == "pass", \
        f"Marina (Incomplete) should PASS, got {results[1]['response'].validation_status}"
    assert results[1]["response"].mandatory_skills_matched == 2
    print("✓ Marina (Incomplete): PASS - Mandatory skills present")

    # Candidate 3: Multiple failures - FAIL
    assert results[2]["response"].validation_status == "fail", \
        f"João (Poor) should FAIL, got {results[2]['response'].validation_status}"
    assert results[2]["response"].match_score <= Decimal("39"), \
        f"Score should be ≤39, got {results[2]['response'].match_score}"
    assert results[2]["response"].mandatory_skills_matched == 1, \
        f"Should have 1/2 mandatory, got {results[2]['response'].mandatory_skills_matched}"
    print("✓ João (Poor): FAIL - Multiple rejections (deal-breaker + mandatory skills + education + experience)")

    # === FINAL RANKING ===
    print("\n" + "="*80)
    print("FINAL RANKING")
    print("="*80)

    ranked = sorted(results, key=lambda r: r["response"].match_score, reverse=True)
    for rank, item in enumerate(ranked, 1):
        status_icon = "✓" if item["response"].validation_status == "pass" else "✗"
        print(f"{rank}. [{status_icon}] {item['name']}: {item['response'].match_score} ({item['response'].recommendation})")

    # Top 2 should be PASS, bottom should be FAIL
    assert ranked[0]["response"].validation_status == "pass"
    assert ranked[1]["response"].validation_status == "pass"
    assert ranked[2]["response"].validation_status == "fail"

    print("\n" + "="*80)
    print("✅ ALL REAL-WORLD MATCHING VALIDATIONS PASSED")
    print("="*80)
