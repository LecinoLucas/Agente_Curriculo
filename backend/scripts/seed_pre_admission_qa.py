from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import sqlalchemy as sa

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.core.settings import settings
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.database.models.admission_package_model import AdmissionExportPackageModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.database.models.user_model import UserModel

QA_STAFF_EMAIL = "assistant.qa.seed@example.test"
QA_CANDIDATE_EMAIL = "qa.admissional@example.test"
QA_FAKE_CPF = "00000000000"
QA_JOB_TITLE = "Analista QA Admissional"
QA_CASE_NOTES = "QA seed for AI assistant admission validation. Fictitious data only."
QA_PACKAGE_IDEMPOTENCY = "qa-protheus-seed-package"


@dataclass(frozen=True)
class ChecklistSeedItem:
    document_key: str
    item_type: str
    title: str
    item_status: str
    required: bool
    filename: str | None = None
    document_status: str | None = None
    rejection_reason_public: str | None = None
    review_notes: str | None = None


def build_seed_blueprint() -> dict[str, object]:
    checklist_items = [
        ChecklistSeedItem(
            document_key="rg",
            item_type="rg",
            title="Documento de identificação",
            item_status="approved",
            required=True,
            filename="documento-identificacao-qa.pdf",
            document_status="approved",
        ),
        ChecklistSeedItem(
            document_key="pis",
            item_type="pis",
            title="PIS",
            item_status="approved",
            required=True,
            filename="pis-qa.pdf",
            document_status="approved",
        ),
        ChecklistSeedItem(
            document_key="carteira_trabalho",
            item_type="carteira_trabalho",
            title="Carteira de trabalho",
            item_status="approved",
            required=True,
            filename="ctps-qa.pdf",
            document_status="approved",
        ),
        ChecklistSeedItem(
            document_key="comprovante_endereco",
            item_type="comprovante_endereco",
            title="Comprovante de residência",
            item_status="received",
            required=True,
            filename="comprovante-residencia-qa.pdf",
            document_status="uploaded",
        ),
        ChecklistSeedItem(
            document_key="dados_bancarios",
            item_type="dados_bancarios",
            title="Dados bancários",
            item_status="rejected",
            required=True,
            filename="dados-bancarios-qa.pdf",
            document_status="rejected",
            rejection_reason_public="Reenvie os dados bancários em documento legível.",
            review_notes="Nota interna QA: rejeição sintética para validação read-only.",
        ),
        ChecklistSeedItem(
            document_key="exame_admissional",
            item_type="exame_admissional",
            title="ASO",
            item_status="pending",
            required=True,
        ),
    ]

    return {
        "staff_email": QA_STAFF_EMAIL,
        "candidate": {
            "full_name": "Candidato QA Admissional",
            "email": QA_CANDIDATE_EMAIL,
            "cpf": QA_FAKE_CPF,
            "phone": None,
            "application_source": "manual",
            "data_quality_status": "valid",
        },
        "job": {
            "title": QA_JOB_TITLE,
            "description": "Vaga fictícia para validar fluxos admissionais do Assistente IA.",
            "requirements": "Checklist sintético e integração dry-run apenas para QA.",
            "status": "published",
            "work_model": "hybrid",
            "location": "São Luís - MA",
        },
        "case": {
            "status": "documents_pending",
            "work_model": "CLT",
            "notes": QA_CASE_NOTES,
            "start_date": "2026-06-20",
            "salary_offer": "3200.00",
        },
        "checklist_items": checklist_items,
        "events": [
            ("case_created", None),
            ("document_uploaded", {"original_filename": "comprovante-residencia-qa.pdf"}),
            ("checklist_item_rejected", None),
            ("checklist_item_correction_requested", None),
        ],
        "package": {
            "status": "approved_for_export",
            "payload_json": {
                "idempotency_key": QA_PACKAGE_IDEMPOTENCY,
                "candidate_display_name": "Candidato QA Admissional",
                "job_title": QA_JOB_TITLE,
                "safe_mode": "qa_seed",
            },
            "validation_errors_json": [],
        },
    }


def validate_seed_blueprint(blueprint: dict[str, object]) -> None:
    candidate = blueprint["candidate"]
    assert isinstance(candidate, dict)
    assert str(candidate["email"]).endswith(".test")
    assert candidate["phone"] in (None, "")
    assert candidate["cpf"] == QA_FAKE_CPF

    staff_email = blueprint["staff_email"]
    assert isinstance(staff_email, str) and staff_email.endswith(".test")

    package = blueprint["package"]
    assert isinstance(package, dict)
    payload = package["payload_json"]
    assert isinstance(payload, dict)
    for forbidden in ("cpf", "phone", "payload_json", "review_notes", "ocr_text", "raw_text"):
        assert forbidden not in payload


async def _get_or_create_staff_user(session) -> UserModel:
    user = await session.scalar(sa.select(UserModel).where(UserModel.email == QA_STAFF_EMAIL))
    if user is None:
        now = datetime.now(UTC)
        user = UserModel(
            id=uuid4(),
            email=QA_STAFF_EMAIL,
            password_hash="seed-not-for-login",
            role="admin",
            status="active",
            full_name="Assistant QA Seed",
            created_at=now,
            updated_at=now,
        )
        session.add(user)
        await session.flush()
    else:
        user.full_name = "Assistant QA Seed"
        user.role = "admin"
        user.status = "active"
        user.updated_at = datetime.now(UTC)
        await session.flush()
    return user


async def _get_or_create_candidate(session, *, created_by: UUID, blueprint: dict[str, object]) -> CandidateModel:
    candidate_data = blueprint["candidate"]
    assert isinstance(candidate_data, dict)
    candidate = await session.scalar(
        sa.select(CandidateModel).where(CandidateModel.email == candidate_data["email"])
    )
    now = datetime.now(UTC)
    if candidate is None:
        candidate = CandidateModel(
            id=uuid4(),
            full_name=str(candidate_data["full_name"]),
            email=str(candidate_data["email"]),
            phone=None,
            cpf=str(candidate_data["cpf"]),
            cpf_hash=None,
            cpf_last4=None,
            location_city="São Luís",
            location_state="MA",
            location_country="BR",
            internal_notes="QA seed only. Do not use for real admissions.",
            tags=["qa", "assistant", "pre_admission"],
            created_by=created_by,
            application_source=str(candidate_data["application_source"]),
            data_quality_status=str(candidate_data["data_quality_status"]),
            created_at=now,
            updated_at=now,
        )
        session.add(candidate)
    else:
        candidate.full_name = str(candidate_data["full_name"])
        candidate.phone = None
        candidate.cpf = str(candidate_data["cpf"])
        candidate.location_city = "São Luís"
        candidate.location_state = "MA"
        candidate.location_country = "BR"
        candidate.internal_notes = "QA seed only. Do not use for real admissions."
        candidate.tags = ["qa", "assistant", "pre_admission"]
        candidate.created_by = created_by
        candidate.application_source = str(candidate_data["application_source"])
        candidate.data_quality_status = str(candidate_data["data_quality_status"])
        candidate.updated_at = now
    await session.flush()
    return candidate


async def _get_or_create_job(session, *, created_by: UUID, blueprint: dict[str, object]) -> JobModel:
    job_data = blueprint["job"]
    assert isinstance(job_data, dict)
    job = await session.scalar(sa.select(JobModel).where(JobModel.title == job_data["title"]))
    now = datetime.now(UTC)
    if job is None:
        job = JobModel(
            id=uuid4(),
            title=str(job_data["title"]),
            description=str(job_data["description"]),
            requirements=str(job_data["requirements"]),
            status=str(job_data["status"]),
            work_model=str(job_data["work_model"]),
            location=str(job_data["location"]),
            created_by=created_by,
            published_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(job)
    else:
        job.description = str(job_data["description"])
        job.requirements = str(job_data["requirements"])
        job.status = str(job_data["status"])
        job.work_model = str(job_data["work_model"])
        job.location = str(job_data["location"])
        job.created_by = created_by
        job.published_at = job.published_at or now
        job.updated_at = now
    await session.flush()
    return job


async def _get_or_create_pipeline(session, *, candidate_id: UUID, job_id: UUID, actor_id: UUID) -> CandidateJobPipelineModel:
    pipeline = await session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    now = datetime.now(UTC)
    if pipeline is None:
        pipeline = CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            link_status="active",
            relationship_status="active",
            is_terminal=False,
            pipeline_stage="pre_admission",
            pipeline_status="active",
            source="manual",
            entered_at=now,
            last_moved_by=actor_id,
            created_at=now,
            updated_at=now,
        )
        session.add(pipeline)
    else:
        pipeline.link_status = "active"
        pipeline.relationship_status = "active"
        pipeline.is_terminal = False
        pipeline.terminated_at = None
        pipeline.termination_reason = None
        pipeline.pipeline_stage = "pre_admission"
        pipeline.pipeline_status = "active"
        pipeline.source = "manual"
        pipeline.entered_at = pipeline.entered_at or now
        pipeline.last_moved_by = actor_id
        pipeline.updated_at = now
    await session.flush()
    return pipeline


async def _get_or_create_hiring_decision(
    session,
    *,
    candidate_id: UUID,
    job_id: UUID,
    actor_id: UUID,
) -> CandidateJobHiringDecisionModel:
    decision = await session.scalar(
        sa.select(CandidateJobHiringDecisionModel)
        .where(
            CandidateJobHiringDecisionModel.candidate_id == candidate_id,
            CandidateJobHiringDecisionModel.job_id == job_id,
            CandidateJobHiringDecisionModel.decision_outcome == "hire",
            CandidateJobHiringDecisionModel.reason_code == "strong_fit",
        )
        .order_by(CandidateJobHiringDecisionModel.created_at.desc())
    )
    now = datetime.now(UTC)
    if decision is None:
        decision = CandidateJobHiringDecisionModel(
            id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            decided_by=actor_id,
            decision_status="submitted",
            decision_outcome="hire",
            reason_code="strong_fit",
            notes="QA seed hiring decision. Fictitious only.",
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(decision)
    else:
        decision.decided_by = actor_id
        decision.decision_status = "submitted"
        decision.decision_outcome = "hire"
        decision.reason_code = "strong_fit"
        decision.notes = "QA seed hiring decision. Fictitious only."
        decision.submitted_at = decision.submitted_at or now
        decision.updated_at = now
    await session.flush()
    return decision


async def _get_or_create_case(
    session,
    *,
    candidate_id: UUID,
    job_id: UUID,
    hiring_decision_id: UUID,
    created_by: UUID,
    blueprint: dict[str, object],
) -> PreAdmissionCaseModel:
    case_data = blueprint["case"]
    assert isinstance(case_data, dict)
    case = await session.scalar(
        sa.select(PreAdmissionCaseModel).where(
            PreAdmissionCaseModel.candidate_id == candidate_id,
            PreAdmissionCaseModel.job_id == job_id,
        )
    )
    now = datetime.now(UTC)
    if case is None:
        case = PreAdmissionCaseModel(
            id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            hiring_decision_id=hiring_decision_id,
            checklist_template_name="QA Assistant Admission Seed",
            status=str(case_data["status"]),
            salary_offer=Decimal(str(case_data["salary_offer"])),
            start_date=date.fromisoformat(str(case_data["start_date"])),
            work_model=str(case_data["work_model"]),
            notes=str(case_data["notes"]),
            created_by=created_by,
            ready_for_export=False,
            created_at=now,
            updated_at=now,
        )
        session.add(case)
    else:
        case.hiring_decision_id = hiring_decision_id
        case.checklist_template_name = "QA Assistant Admission Seed"
        case.status = str(case_data["status"])
        case.salary_offer = Decimal(str(case_data["salary_offer"]))
        case.start_date = date.fromisoformat(str(case_data["start_date"]))
        case.work_model = str(case_data["work_model"])
        case.notes = str(case_data["notes"])
        case.created_by = created_by
        case.ready_for_export = False
        case.ready_for_export_at = None
        case.ready_for_export_by = None
        case.closed_at = None
        case.dismissed_at = None
        case.dismissal_reason = None
        case.updated_at = now
    await session.flush()
    return case


async def _reset_case_children(session, *, case_id: UUID) -> None:
    await session.execute(
        sa.delete(AdmissionExportPackageModel).where(AdmissionExportPackageModel.case_id == case_id)
    )
    await session.execute(
        sa.delete(PreAdmissionDocumentModel).where(PreAdmissionDocumentModel.case_id == case_id)
    )
    await session.execute(
        sa.delete(PreAdmissionEventModel).where(PreAdmissionEventModel.case_id == case_id)
    )
    await session.execute(
        sa.delete(PreAdmissionChecklistItemModel).where(PreAdmissionChecklistItemModel.case_id == case_id)
    )
    await session.flush()


async def _seed_checklist_and_documents(
    session,
    *,
    case: PreAdmissionCaseModel,
    candidate_id: UUID,
    actor_id: UUID,
    checklist_items: list[ChecklistSeedItem],
) -> tuple[list[PreAdmissionChecklistItemModel], list[PreAdmissionDocumentModel]]:
    now = datetime.now(UTC)
    created_items: list[PreAdmissionChecklistItemModel] = []
    created_documents: list[PreAdmissionDocumentModel] = []

    for index, spec in enumerate(checklist_items):
        item = PreAdmissionChecklistItemModel(
            id=uuid4(),
            case_id=case.id,
            template_item_id=None,
            document_key=spec.document_key,
            item_type=spec.item_type,
            title=spec.title,
            status=spec.item_status,
            required=spec.required,
            notes="QA seed item.",
            candidate_description="Documento sintético apenas para validação de QA.",
            accepted_file_types=["application/pdf"],
            max_file_size_mb=10,
            display_order=index,
            created_at=now,
            updated_at=now,
        )
        session.add(item)
        created_items.append(item)
        await session.flush()

        if spec.filename and spec.document_status:
            reviewed_at = now if spec.document_status in {"approved", "rejected"} else None
            reviewed_by = actor_id if reviewed_at else None
            document = PreAdmissionDocumentModel(
                id=uuid4(),
                case_id=case.id,
                checklist_item_id=item.id,
                candidate_id=candidate_id,
                original_filename=spec.filename,
                stored_filename=spec.filename,
                storage_key=f"qa-seed/{case.id}/{spec.filename}",
                mime_type="application/pdf",
                size_bytes=2048,
                status=spec.document_status,
                uploaded_at=now,
                reviewed_at=reviewed_at,
                reviewed_by=reviewed_by,
                review_notes=spec.review_notes,
                rejection_reason_public=spec.rejection_reason_public,
                created_at=now,
                updated_at=now,
            )
            session.add(document)
            created_documents.append(document)

    await session.flush()
    return created_items, created_documents


async def _seed_events(
    session,
    *,
    case_id: UUID,
    actor_id: UUID,
    events: list[tuple[str, dict | None]],
) -> list[PreAdmissionEventModel]:
    base_time = datetime.now(UTC)
    created: list[PreAdmissionEventModel] = []
    for index, (event_type, payload) in enumerate(events):
        event = PreAdmissionEventModel(
            id=uuid4(),
            case_id=case_id,
            event_type=event_type,
            actor_id=actor_id,
            payload_json=payload,
            created_at=base_time.replace(microsecond=0),
        )
        created.append(event)
        session.add(event)
        base_time = datetime.fromtimestamp(base_time.timestamp() + 60, tz=UTC)
    await session.flush()
    return created


async def _create_synthetic_package(
    session,
    *,
    case: PreAdmissionCaseModel,
    candidate_id: UUID,
    job_id: UUID,
    actor_id: UUID,
    blueprint: dict[str, object],
) -> AdmissionExportPackageModel:
    package_data = blueprint["package"]
    assert isinstance(package_data, dict)
    now = datetime.now(UTC)
    package = AdmissionExportPackageModel(
        id=uuid4(),
        case_id=case.id,
        candidate_id=candidate_id,
        job_id=job_id,
        status=str(package_data["status"]),
        payload_json=dict(package_data["payload_json"]),
        validation_errors_json=list(package_data["validation_errors_json"]),
        created_by=actor_id,
        approved_by=actor_id,
        created_at=now,
        updated_at=now,
        approved_at=now,
        exported_at=None,
        cancelled_at=None,
    )
    session.add(package)
    await session.flush()
    return package


async def run_seed(*, reset: bool = False) -> dict[str, str]:
    blueprint = build_seed_blueprint()
    validate_seed_blueprint(blueprint)

    async with AsyncSessionFactory() as session:
        staff = await _get_or_create_staff_user(session)
        candidate = await _get_or_create_candidate(
            session,
            created_by=staff.id,
            blueprint=blueprint,
        )
        job = await _get_or_create_job(session, created_by=staff.id, blueprint=blueprint)
        await _get_or_create_pipeline(
            session,
            candidate_id=candidate.id,
            job_id=job.id,
            actor_id=staff.id,
        )
        decision = await _get_or_create_hiring_decision(
            session,
            candidate_id=candidate.id,
            job_id=job.id,
            actor_id=staff.id,
        )
        case = await _get_or_create_case(
            session,
            candidate_id=candidate.id,
            job_id=job.id,
            hiring_decision_id=decision.id,
            created_by=staff.id,
            blueprint=blueprint,
        )

        await _reset_case_children(session, case_id=case.id)

        checklist_specs = blueprint["checklist_items"]
        assert isinstance(checklist_specs, list)
        items, documents = await _seed_checklist_and_documents(
            session,
            case=case,
            candidate_id=candidate.id,
            actor_id=staff.id,
            checklist_items=checklist_specs,
        )

        events_spec = blueprint["events"]
        assert isinstance(events_spec, list)
        events = await _seed_events(
            session,
            case_id=case.id,
            actor_id=staff.id,
            events=events_spec,
        )

        package = await _create_synthetic_package(
            session,
            case=case,
            candidate_id=candidate.id,
            job_id=job.id,
            actor_id=staff.id,
            blueprint=blueprint,
        )

        await session.commit()

    result = {
        "candidate_id": str(candidate.id),
        "job_id": str(job.id),
        "case_id": str(case.id),
        "package_id": str(package.id),
        "documents_count": str(len(documents)),
        "checklist_items_count": str(len(items)),
        "events_count": str(len(events)),
    }

    print(f"[ok] Candidate QA: {result['candidate_id']}")
    print(f"[ok] Job QA: {result['job_id']}")
    print(f"[ok] Pre-admission case QA: {result['case_id']}")
    print(f"[ok] Checklist items: {result['checklist_items_count']}")
    print(f"[ok] Documents: {result['documents_count']}")
    print(f"[ok] Events: {result['events_count']}")
    print(f"[ok] Package QA: {result['package_id']}")
    print(
        "[ok] Protheus real send: disabled"
        if not settings.PROTHEUS_REAL_SEND_ENABLED and not settings.ERP_ALLOW_REAL_SEND
        else "[warn] Protheus real send flags are enabled"
    )

    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed fictitious pre-admission QA data for AI Assistant validation.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Recreate checklist items, documents, events, and synthetic package for the QA case.",
    )
    return parser.parse_args()


async def _main() -> None:
    args = parse_args()
    await run_seed(reset=args.reset)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
