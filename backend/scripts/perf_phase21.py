#!/usr/bin/env python
"""Phase 21 lightweight performance diagnostics.

Runs the FastAPI app in-process against an isolated SQLite database, seeds fake
data, measures priority read endpoints, and writes a JSON report. It does not
touch the development database.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from statistics import median
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.infrastructure.database.base import Base
from src.infrastructure.database.connection import get_db_session
from src.infrastructure.database.models import (  # noqa: F401 - loads all metadata
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAssignmentModel,
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
    CandidateAuthTokenModel,
    CandidateCommunicationModel,
    CandidateJobHiringDecisionModel,
    CandidateJobMatchModel,
    CandidateJobPipelineModel,
    CandidateJobScoreModel,
    CandidateModel,
    CandidateProfileAnalysisModel,
    InterviewScheduleModel,
    InterviewScorecardItemModel,
    InterviewScorecardModel,
    JobModel,
    JobProfileAnalysisModel,
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
    PromptTemplateModel,
    ResumeModel,
    ResumeVersionModel,
    ScoreModelVersionModel,
    UserModel,
)
from src.infrastructure.security.jwt_service import create_access_token
from src.interface.api.dependencies import get_db
from src.interface.api.main import app


PROFILE_SIZES = {
    "small": {
        "candidates": 100,
        "jobs": 10,
        "pipelines": 500,
        "communications": 500,
        "interviews": 100,
        "pre_admissions": 50,
    },
    "medium": {
        "candidates": 1_000,
        "jobs": 50,
        "pipelines": 5_000,
        "communications": 5_000,
        "interviews": 1_000,
        "pre_admissions": 500,
    },
}

STAGES = ("entry", "screening", "hr_interview", "technical_interview", "final", "offer")


@dataclass(slots=True)
class SeedContext:
    admin_id: UUID
    recruiter_id: UUID
    manager_id: UUID
    target_job_id: UUID
    target_candidate_id: UUID
    target_interview_id: UUID
    target_case_id: UUID
    portal_token: str


class SQLCollector:
    def __init__(self) -> None:
        self.records: list[dict[str, Any]] = []

    def clear(self) -> None:
        self.records.clear()

    def before_cursor_execute(self, conn, cursor, statement, parameters, context, executemany) -> None:
        context._phase21_started_at = time.perf_counter()

    def after_cursor_execute(self, conn, cursor, statement, parameters, context, executemany) -> None:
        started = getattr(context, "_phase21_started_at", None)
        duration_ms = ((time.perf_counter() - started) * 1000) if started else 0.0
        self.records.append(
            {
                "sql": normalize_sql(statement),
                "duration_ms": round(duration_ms, 3),
                "executemany": bool(executemany),
            }
        )


def normalize_sql(statement: str) -> str:
    normalized = re.sub(r"\s+", " ", statement).strip()
    normalized = re.sub(r"\bIN \(\?([,\s?]*)\)", "IN (...)", normalized)
    return normalized[:500]


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = math.ceil((pct / 100) * len(ordered)) - 1
    return round(ordered[max(0, min(index, len(ordered) - 1))], 2)


def auth_header(user_id: UUID, role: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user_id), role)}"}


async def create_isolated_engine() -> tuple[AsyncEngine, async_sessionmaker[AsyncSession], SQLCollector]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _register_sqlite_functions(dbapi_connection: object, _connection_record: object) -> None:
        if hasattr(dbapi_connection, "create_function"):
            dbapi_connection.create_function(
                "NOW",
                0,
                lambda: datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S"),
            )
            dbapi_connection.create_function("uuid_generate_v4", 0, lambda: str(uuid4()))

    collector = SQLCollector()
    event.listen(engine.sync_engine, "before_cursor_execute", collector.before_cursor_execute)
    event.listen(engine.sync_engine, "after_cursor_execute", collector.after_cursor_execute)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, session_factory, collector


async def override_app_database(session_factory: async_sessionmaker[AsyncSession]) -> None:
    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    fastapi_app = app.app if hasattr(app, "app") else app
    fastapi_app.dependency_overrides[get_db] = override_get_db
    fastapi_app.dependency_overrides[get_db_session] = override_get_db

    import src.interface.api.middlewares.audit_middleware as audit_middleware

    audit_middleware.AsyncSessionFactory = session_factory


async def seed_fake_data(session: AsyncSession, profile: str) -> SeedContext:
    cfg = PROFILE_SIZES[profile]
    now = datetime.now(UTC)

    admin_id = uuid4()
    recruiter_id = uuid4()
    manager_id = uuid4()
    viewer_id = uuid4()
    users = [
        UserModel(id=admin_id, email="phase21-admin@example.com", full_name="Phase 21 Admin", role="admin", status="active", password_hash="fake"),
        UserModel(id=recruiter_id, email="phase21-recruiter@example.com", full_name="Phase 21 Recruiter", role="recruiter", status="active", password_hash="fake"),
        UserModel(id=manager_id, email="phase21-manager@example.com", full_name="Phase 21 Manager", role="manager", status="active", password_hash="fake"),
        UserModel(id=viewer_id, email="phase21-viewer@example.com", full_name="Phase 21 Viewer", role="viewer", status="active", password_hash="fake"),
    ]
    session.add_all(users)

    ai_model_id = uuid4()
    prompt_id = uuid4()
    score_version_id = uuid4()
    session.add_all(
        [
            AIModelModel(id=ai_model_id, provider="mock", model_id="mock-phase21", model_name="Mock Phase 21"),
            PromptTemplateModel(
                id=prompt_id,
                name="phase21",
                version=1,
                template_type="analysis",
                user_prompt_template="fake",
                created_by=recruiter_id,
                is_active=True,
                activated_at=now,
            ),
            ScoreModelVersionModel(
                id=score_version_id,
                version="phase21",
                weights={"skills": 1},
                thresholds={"high": 75, "low": 50},
                is_active=True,
            ),
        ]
    )

    template_id = uuid4()
    competency_id = uuid4()
    question_id = uuid4()
    session.add_all(
        [
            BehavioralAssessmentTemplateModel(
                id=template_id,
                name="Phase 21 Behavioral",
                description="fake",
                status="active",
                created_by=recruiter_id,
            ),
            BehavioralTemplateCompetencyModel(
                id=competency_id,
                template_id=template_id,
                name="Comunicação",
                description="fake",
                weight=Decimal("1.00"),
                display_order=1,
            ),
            BehavioralTemplateQuestionModel(
                id=question_id,
                competency_id=competency_id,
                question_text="Descreva um alinhamento difícil.",
                answer_type="text",
                is_required=True,
                weight=Decimal("1.00"),
                display_order=1,
            ),
        ]
    )

    job_ids = [uuid4() for _ in range(cfg["jobs"])]
    target_job_id = job_ids[0]
    jobs = []
    job_profiles = []
    for index, job_id in enumerate(job_ids):
        hash_value = f"jobhash{index:08d}"
        jobs.append(
            JobModel(
                id=job_id,
                title=f"Vaga Perf {index:03d}",
                description="Vaga fake para diagnóstico de performance.",
                requirements="Python, FastAPI, React, SQL.",
                status="published",
                seniority_level="senior",
                minimum_education_level="bachelor",
                minimum_years_experience=Decimal("3.0"),
                work_model="hybrid",
                location="São Paulo",
                job_area="engineering",
                skill_requirements={"priority": ["Python", "SQL"], "complementary": ["React"], "eliminatory": []},
                job_profile_hash=hash_value,
                behavioral_template_id=template_id if index == 0 else None,
                created_by=recruiter_id,
                published_at=now,
                created_at=now - timedelta(days=index),
                updated_at=now,
            )
        )
        job_profiles.append(
            JobProfileAnalysisModel(
                id=uuid4(),
                job_id=job_id,
                provider="mock",
                model_id="mock-phase21",
                prompt_version="phase21",
                job_signature_hash=hash_value,
                job_area="engineering",
                seniority_required="senior",
                education_required="bachelor",
                experience_required=Decimal("3.0"),
                responsibilities_json=["Build APIs"],
                raw_response_json={"fake": True},
                input_tokens=0,
                output_tokens=0,
                is_active=True,
            )
        )
    session.add_all(jobs + job_profiles)

    candidate_ids = [uuid4() for _ in range(cfg["candidates"])]
    target_candidate_id = candidate_ids[0]
    candidates = []
    resumes = []
    resume_versions = []
    analyses = []
    analysis_results = []
    candidate_profiles = []
    matches = []
    scores = []
    active_pipelines = []
    now_hash = jobs[0].job_profile_hash
    target_job_profile_id = job_profiles[0].id

    for index, candidate_id in enumerate(candidate_ids):
        resume_id = uuid4()
        resume_version_id = uuid4()
        analysis_id = uuid4()
        candidate_profile_id = uuid4()
        score = Decimal("55.00") + Decimal(index % 45)
        pipeline_id = uuid5(NAMESPACE_URL, f"{candidate_id}:{target_job_id}")
        candidates.append(
            CandidateModel(
                id=candidate_id,
                full_name=f"Candidato Perf {index:04d}",
                email=f"candidato.perf.{index:04d}@example.com",
                phone="11999999999",
                cpf=f"{index % 10**11:011d}",
                created_by=recruiter_id,
                application_source="phase21_fake",
                data_quality_status="valid",
                created_at=now - timedelta(minutes=index),
                updated_at=now,
                password_hash="fake",
                password_created_at=now,
            )
        )
        resumes.append(
            ResumeModel(
                id=resume_id,
                candidate_id=candidate_id,
                title=f"Curriculo Perf {index:04d}",
                status="active",
                current_version=1,
                created_by=recruiter_id,
                created_at=now,
                updated_at=now,
            )
        )
        resume_versions.append(
            ResumeVersionModel(
                id=resume_version_id,
                resume_id=resume_id,
                version_number=1,
                s3_bucket="fake",
                s3_key=f"phase21/{candidate_id}.pdf",
                original_file_name="curriculo-fake.pdf",
                file_size_bytes=1024,
                file_hash_sha256=sha256(str(candidate_id).encode()).hexdigest(),
                mime_type="application/pdf",
                extracted_text="Python FastAPI React SQL testes comunicação colaboração.",
                extraction_status="completed",
                candidate_profile_hash=f"candhash{index:08d}",
                uploaded_by=recruiter_id,
                uploaded_at=now,
            )
        )
        analyses.append(
            AnalysisModel(
                id=analysis_id,
                resume_version_id=resume_version_id,
                job_id=target_job_id,
                ai_model_id=ai_model_id,
                prompt_template_id=prompt_id,
                status="completed",
                requested_by=recruiter_id,
                started_at=now,
                completed_at=now,
                created_at=now,
                updated_at=now,
            )
        )
        analysis_results.append(
            AnalysisResultModel(
                id=uuid4(),
                analysis_id=analysis_id,
                candidate_summary="Resumo fake controlado.",
                seniority_level="senior",
                total_experience_years=Decimal("5.0"),
                highest_education_level="bachelor",
                strengths=["Python", "Comunicação"],
                weaknesses=["Validar contexto"],
                recommendations=["Entrevistar"],
                keywords=["Python", "FastAPI", "React", "SQL"],
                extracted_data={"fake": True},
                input_tokens=0,
                output_tokens=0,
            )
        )
        candidate_profiles.append(
            CandidateProfileAnalysisModel(
                id=candidate_profile_id,
                candidate_id=candidate_id,
                resume_version_id=resume_version_id,
                provider="mock",
                model_id="mock-phase21",
                prompt_version="phase21",
                professional_area="engineering",
                seniority_level="senior",
                education_level="bachelor",
                experience_years=Decimal("5.0"),
                skills_json=["Python", "FastAPI", "React", "SQL"],
                summary="Perfil fake.",
                strengths_json=["Python"],
                weaknesses_json=[],
                raw_response_json={"fake": True},
                input_tokens=0,
                output_tokens=0,
            )
        )
        matches.append(
            CandidateJobMatchModel(
                id=uuid4(),
                candidate_id=candidate_id,
                job_id=target_job_id,
                resume_version_id=resume_version_id,
                candidate_profile_analysis_id=candidate_profile_id,
                job_profile_analysis_id=target_job_profile_id,
                candidate_job_pipeline_id=pipeline_id,
                recommendation="strong_fit",
                matched_skills_json=["Python", "SQL"],
                missing_skills_json=[],
                explanation="Match fake.",
                eligibility_status="PASS",
                score_version="phase21",
                skill_evidence_breakdown={"priority_score_weighted": 80, "validation_status": "pass"},
                freshness_status="fresh",
                job_signature_hash=now_hash,
                created_at=now,
                updated_at=now,
            )
        )
        scores.append(
            CandidateJobScoreModel(
                id=uuid4(),
                candidate_id=candidate_id,
                job_id=target_job_id,
                version_id=score_version_id,
                source_analysis_id=analysis_id,
                source_analysis_created_at=now,
                input_hash=sha256(f"{candidate_id}:{target_job_id}".encode()).hexdigest(),
                score_model_version="phase21",
                explainability_version="phase21",
                final_score=score,
                decision_suggestion="review",
                breakdown={"final_score": float(score), "validation_status": "pass"},
                reason_codes=[{"code": "skills_match", "impact": 1}],
                explanation_text="Score fake controlado.",
                factor_summary_json={"positive": [], "negative": []},
                freshness_status="fresh",
                recompute_reason="phase21_seed",
                job_signature_hash=now_hash,
                job_updated_at=now,
                computed_at=now,
                updated_at=now,
            )
        )
        active_pipelines.append(
            CandidateJobPipelineModel(
                candidate_job_pipeline_id=pipeline_id,
                candidate_id=candidate_id,
                job_id=target_job_id,
                resume_version_id=resume_version_id,
                current_analysis_id=analysis_id,
                pipeline_stage=STAGES[index % len(STAGES)],
                pipeline_status="active",
                link_status="active",
                relationship_status="active",
                is_terminal=False,
                entered_at=now,
                created_at=now,
                updated_at=now,
                source="manual",
            )
        )

    session.add_all(candidates)
    session.add_all(resumes + resume_versions + analyses + analysis_results)
    session.add_all(candidate_profiles + matches + scores + active_pipelines)
    await session.flush()

    extra_pipeline_count = max(0, cfg["pipelines"] - cfg["candidates"])
    extra_pipelines = []
    for index in range(extra_pipeline_count):
        candidate_id = candidate_ids[index % len(candidate_ids)]
        job_id = job_ids[1 + (index % max(1, len(job_ids) - 1))]
        extra_pipelines.append(
            CandidateJobPipelineModel(
                candidate_job_pipeline_id=uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}"),
                candidate_id=candidate_id,
                job_id=job_id,
                pipeline_stage="rejected",
                pipeline_status="terminal",
                link_status="rejected",
                relationship_status="rejected",
                is_terminal=True,
                terminated_at=now,
                termination_reason="phase21 fake terminal history",
                entered_at=now - timedelta(days=10),
                created_at=now - timedelta(days=10),
                updated_at=now - timedelta(days=5),
                source="manual",
            )
        )
    session.add_all(extra_pipelines)

    assignment_id = uuid4()
    session.add_all(
        [
            BehavioralAssessmentAssignmentModel(
                id=assignment_id,
                candidate_id=target_candidate_id,
                job_id=target_job_id,
                template_id=template_id,
                status="submitted",
                assigned_at=now,
                started_at=now,
                submitted_at=now,
            ),
            BehavioralAssessmentAnswerModel(
                id=uuid4(),
                assignment_id=assignment_id,
                question_id=question_id,
                answer_text="Resposta fake de comunicação.",
            ),
            BehavioralAssessmentAIEvaluationModel(
                id=uuid4(),
                assignment_id=assignment_id,
                candidate_id=target_candidate_id,
                job_id=target_job_id,
                template_id=template_id,
                status="completed",
                provider="mock",
                model="mock-phase21",
                confidence="medium",
                summary="Parecer assistivo fake, sem decisão automática.",
                strengths_json=["Comunicação"],
                concerns_json=[],
                competency_signals_json=[],
                suggested_interview_questions_json=["Conte outro exemplo."],
                evidence_json={"fake": True},
                risk_flags_json=[],
                completed_at=now,
            ),
        ]
    )

    interview_count = cfg["interviews"]
    interviews = []
    scorecards = []
    scorecard_items = []
    target_interview_id = uuid4()
    for index in range(interview_count):
        candidate_id = candidate_ids[index % len(candidate_ids)]
        interview_id = target_interview_id if index == 0 else uuid4()
        interviews.append(
            InterviewScheduleModel(
                id=interview_id,
                candidate_id=candidate_id,
                job_id=target_job_id,
                pipeline_id=uuid5(NAMESPACE_URL, f"{candidate_id}:{target_job_id}"),
                title=f"Entrevista Perf {index:04d}",
                scheduled_start=now + timedelta(days=index % 30),
                scheduled_end=now + timedelta(days=index % 30, hours=1),
                timezone="America/Sao_Paulo",
                interview_type="manager",
                interview_format="online",
                status="awaiting_feedback" if index % 2 == 0 else "completed",
                interviewer_name="Manager Perf",
                interviewer_email="phase21-manager@example.com",
                created_by=recruiter_id,
                created_at=now,
                updated_at=now,
            )
        )
        scorecard_id = uuid4()
        scorecards.append(
            InterviewScorecardModel(
                id=scorecard_id,
                candidate_id=candidate_id,
                job_id=target_job_id,
                interview_id=interview_id,
                evaluator_id=manager_id,
                status="submitted",
                final_recommendation="yes",
                overall_notes="Fake",
                submitted_at=now,
                created_at=now,
                updated_at=now,
            )
        )
        scorecard_items.append(
            InterviewScorecardItemModel(
                id=uuid4(),
                scorecard_id=scorecard_id,
                competency_name="Comunicação",
                question_text="Explique um alinhamento.",
                rating=4,
                evidence="Fake",
                display_order=1,
            )
        )
    session.add_all(interviews + scorecards + scorecard_items)

    pre_count = min(cfg["pre_admissions"], len(candidate_ids))
    decisions = []
    cases = []
    checklist_items = []
    documents = []
    target_case_id = uuid4()
    for index, candidate_id in enumerate(candidate_ids[:pre_count]):
        decision_id = uuid4()
        case_id = target_case_id if index == 0 else uuid4()
        item_id = uuid4()
        decisions.append(
            CandidateJobHiringDecisionModel(
                id=decision_id,
                candidate_id=candidate_id,
                job_id=target_job_id,
                pipeline_id=uuid5(NAMESPACE_URL, f"{candidate_id}:{target_job_id}"),
                decided_by=recruiter_id,
                decision_status="submitted",
                decision_outcome="hire",
                reason_code="strong_fit",
                notes="Fake",
                submitted_at=now,
            )
        )
        cases.append(
            PreAdmissionCaseModel(
                id=case_id,
                candidate_id=candidate_id,
                job_id=target_job_id,
                hiring_decision_id=decision_id,
                status="ready_for_admission",
                salary_offer=Decimal("10000.00"),
                start_date=now.date(),
                work_model="CLT",
                created_by=recruiter_id,
                created_at=now,
                updated_at=now,
            )
        )
        checklist_items.append(
            PreAdmissionChecklistItemModel(
                id=item_id,
                case_id=case_id,
                item_type="rg",
                title="RG fake",
                status="approved",
                required=True,
                created_at=now,
                updated_at=now,
            )
        )
        documents.append(
            PreAdmissionDocumentModel(
                id=uuid4(),
                case_id=case_id,
                checklist_item_id=item_id,
                candidate_id=candidate_id,
                original_filename="rg-fake.pdf",
                stored_filename=f"{candidate_id}.pdf",
                storage_key=f"phase21/{candidate_id}/rg.pdf",
                mime_type="application/pdf",
                size_bytes=128,
                status="approved",
                reviewed_at=now,
                reviewed_by=recruiter_id,
                uploaded_at=now,
                created_at=now,
                updated_at=now,
            )
        )
    session.add_all(decisions + cases + checklist_items + documents)

    communications = []
    for index in range(cfg["communications"]):
        audience = "candidate" if index % 2 == 0 else "recruiter"
        communications.append(
            CandidateCommunicationModel(
                id=uuid4(),
                candidate_id=target_candidate_id,
                job_id=target_job_id,
                related_entity_type="phase21",
                related_entity_id=target_case_id,
                template_key="phase21_fake",
                channel="internal",
                audience=audience,
                subject=f"Comunicado fake {index}",
                body="Mensagem fake sem dados sensíveis.",
                status="sent",
                created_by=recruiter_id,
                created_at=now - timedelta(seconds=index),
                sent_at=now,
            )
        )
    session.add_all(communications)

    portal_token = "phase21-portal-token"
    session.add(
        CandidateAuthTokenModel(
            id=uuid4(),
            candidate_id=target_candidate_id,
            purpose="portal_session",
            token_hash=sha256(portal_token.encode()).hexdigest(),
            expires_at=now + timedelta(hours=24),
            ip_hash=sha256("testclient".encode()).hexdigest(),
            user_agent_hash=sha256("phase21".encode()).hexdigest(),
        )
    )

    await session.commit()
    return SeedContext(
        admin_id=admin_id,
        recruiter_id=recruiter_id,
        manager_id=manager_id,
        target_job_id=target_job_id,
        target_candidate_id=target_candidate_id,
        target_interview_id=target_interview_id,
        target_case_id=target_case_id,
        portal_token=portal_token,
    )


def priority_endpoints(ctx: SeedContext) -> list[dict[str, Any]]:
    recruiter = auth_header(ctx.recruiter_id, "recruiter")
    manager = auth_header(ctx.manager_id, "manager")
    return [
        {"name": "candidates_summaries", "method": "GET", "path": "/api/v1/candidates/summaries?page=1&page_size=100", "headers": recruiter},
        {"name": "pipeline_board", "method": "GET", "path": f"/api/v1/pipeline/{ctx.target_job_id}", "headers": recruiter},
        {"name": "job_ranking", "method": "GET", "path": f"/api/v1/jobs/{ctx.target_job_id}/ranking", "headers": recruiter},
        {"name": "candidate_overview", "method": "GET", "path": f"/api/v1/candidates/{ctx.target_candidate_id}/overview", "headers": recruiter},
        {"name": "decision_summary", "method": "GET", "path": f"/api/v1/jobs/{ctx.target_job_id}/candidates/{ctx.target_candidate_id}/decision-summary", "headers": recruiter},
        {"name": "agenda_interviews", "method": "GET", "path": "/api/v1/agenda/interviews?page=1&page_size=100", "headers": recruiter},
        {"name": "candidate_interviews", "method": "GET", "path": f"/api/v1/jobs/{ctx.target_job_id}/candidates/{ctx.target_candidate_id}/interviews?page=1&page_size=100", "headers": recruiter},
        {"name": "behavioral_assessment", "method": "GET", "path": f"/api/v1/jobs/{ctx.target_job_id}/candidates/{ctx.target_candidate_id}/behavioral-assessment", "headers": recruiter},
        {"name": "interview_scorecard", "method": "GET", "path": f"/api/v1/jobs/{ctx.target_job_id}/candidates/{ctx.target_candidate_id}/interview-scorecard?interview_id={ctx.target_interview_id}", "headers": recruiter},
        {"name": "pre_admission", "method": "GET", "path": f"/api/v1/jobs/{ctx.target_job_id}/candidates/{ctx.target_candidate_id}/pre-admission", "headers": recruiter},
        {"name": "pre_admission_documents", "method": "GET", "path": f"/api/v1/pre-admission/{ctx.target_case_id}/documents", "headers": recruiter},
        {"name": "manager_candidate_summary", "method": "GET", "path": f"/api/v1/manager/jobs/{ctx.target_job_id}/candidates/{ctx.target_candidate_id}/summary", "headers": manager},
        {"name": "communications_recruiter", "method": "GET", "path": f"/api/v1/jobs/{ctx.target_job_id}/candidates/{ctx.target_candidate_id}/communications", "headers": recruiter},
    ]


async def measure_endpoints(
    client: AsyncClient,
    endpoints: list[dict[str, Any]],
    collector: SQLCollector,
    *,
    repeat: int,
) -> list[dict[str, Any]]:
    results = []
    for endpoint in endpoints:
        latencies: list[float] = []
        query_counts: list[int] = []
        sizes: list[int] = []
        statuses: list[int] = []
        repeated_sql = Counter()
        slow_queries: list[dict[str, Any]] = []
        for _ in range(repeat):
            collector.clear()
            started = time.perf_counter()
            response = await client.request(endpoint["method"], endpoint["path"], headers=endpoint["headers"])
            latency_ms = (time.perf_counter() - started) * 1000
            statuses.append(response.status_code)
            sizes.append(len(response.content or b""))
            latencies.append(latency_ms)
            query_counts.append(len(collector.records))
            repeated_sql.update(record["sql"] for record in collector.records)
            slow_queries.extend(collector.records)
        top_repeated = [
            {"count": count, "sql": sql}
            for sql, count in repeated_sql.most_common(5)
            if count > repeat
        ]
        top_slow = sorted(slow_queries, key=lambda item: item["duration_ms"], reverse=True)[:5]
        results.append(
            {
                "name": endpoint["name"],
                "method": endpoint["method"],
                "path": endpoint["path"],
                "status_codes": sorted(set(statuses)),
                "requests": repeat,
                "latency_ms": {
                    "p50": round(median(latencies), 2),
                    "p95": percentile(latencies, 95),
                    "p99": percentile(latencies, 99),
                    "max": round(max(latencies), 2),
                },
                "response_bytes": {
                    "median": int(median(sizes)),
                    "max": max(sizes),
                },
                "queries": {
                    "median": int(median(query_counts)),
                    "max": max(query_counts),
                },
                "repeated_queries": top_repeated,
                "slow_queries": top_slow,
            }
        )
    return results


def inspect_indexes() -> dict[str, Any]:
    tables = []
    missing_fk_indexes = []
    for table in Base.metadata.sorted_tables:
        indexes = [
            {
                "name": index.name,
                "columns": [column.name for column in index.columns],
                "unique": bool(index.unique),
            }
            for index in table.indexes
        ]
        unique_constraints = [
            {
                "name": constraint.name,
                "columns": [column.name for column in constraint.columns],
            }
            for constraint in table.constraints
            if isinstance(constraint, sa.UniqueConstraint)
        ]
        tables.append({"table": table.name, "indexes": indexes, "unique_constraints": unique_constraints})
        indexed_first_columns = {index["columns"][0] for index in indexes if index["columns"]}
        indexed_first_columns.update(
            column.name for column in table.primary_key.columns
        )
        for column in table.columns:
            if column.foreign_keys and column.name not in indexed_first_columns:
                missing_fk_indexes.append(
                    {
                        "table": table.name,
                        "column": column.name,
                        "suggested_index": f"idx_{table.name}_{column.name}",
                    }
                )
    return {"tables": tables, "missing_fk_indexes": missing_fk_indexes}


def build_findings(results: list[dict[str, Any]], index_report: dict[str, Any]) -> dict[str, Any]:
    slowest = sorted(results, key=lambda item: item["latency_ms"]["p95"], reverse=True)
    query_heavy = sorted(results, key=lambda item: item["queries"]["max"], reverse=True)
    possible_n_plus_one = [
        {
            "endpoint": item["name"],
            "queries_max": item["queries"]["max"],
            "repeated_queries": item["repeated_queries"][:3],
        }
        for item in query_heavy
        if item["queries"]["max"] >= 10 or item["repeated_queries"]
    ]
    suspicious_queries = []
    for item in results:
        for query in item["slow_queries"][:2]:
            suspicious_queries.append(
                {
                    "endpoint": item["name"],
                    "duration_ms": query["duration_ms"],
                    "sql": query["sql"],
                }
            )
    suspicious_queries = sorted(suspicious_queries, key=lambda item: item["duration_ms"], reverse=True)[:12]
    return {
        "slowest_endpoints": [
            {
                "name": item["name"],
                "p95_ms": item["latency_ms"]["p95"],
                "queries_max": item["queries"]["max"],
                "response_bytes_max": item["response_bytes"]["max"],
                "status_codes": item["status_codes"],
            }
            for item in slowest
        ],
        "query_heavy_endpoints": [
            {
                "name": item["name"],
                "queries_max": item["queries"]["max"],
                "p95_ms": item["latency_ms"]["p95"],
            }
            for item in query_heavy
        ],
        "possible_n_plus_one": possible_n_plus_one,
        "suspicious_queries": suspicious_queries,
        "missing_fk_indexes": index_report["missing_fk_indexes"],
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 21 lightweight perf diagnostics")
    parser.add_argument("--profile", choices=PROFILE_SIZES.keys(), default="small")
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    engine, session_factory, collector = await create_isolated_engine()
    await override_app_database(session_factory)
    try:
        async with session_factory() as session:
            seed_context = await seed_fake_data(session, args.profile)

        collector.clear()
        index_report = inspect_indexes()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            results = await measure_endpoints(
                client,
                priority_endpoints(seed_context),
                collector,
                repeat=args.repeat,
            )

        report = {
            "generated_at": datetime.now(UTC).isoformat(),
            "profile": args.profile,
            "volume": PROFILE_SIZES[args.profile],
            "repeat": args.repeat,
            "endpoints": results,
            "indexes": index_report,
            "findings": build_findings(results, index_report),
        }

        output = args.output or Path("reports") / f"phase21_perf_{args.profile}.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"phase21_perf_report={output}")
        print(json.dumps(report["findings"]["slowest_endpoints"][:8], indent=2, ensure_ascii=False))
    finally:
        fastapi_app = app.app if hasattr(app, "app") else app
        fastapi_app.dependency_overrides.clear()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
