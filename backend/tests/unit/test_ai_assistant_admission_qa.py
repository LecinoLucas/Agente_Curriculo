from __future__ import annotations

from datetime import UTC, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.domain.entities.user import User, UserRole, UserStatus
from src.interface.api.dependencies import get_current_user
from src.interface.api.main import app

_fastapi_app = app.app if hasattr(app, "app") else app
_ENDPOINT = "/api/v1/ai/assistant/read-only"


def _user(role: UserRole = UserRole.ADMIN) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=uuid4(),
        email=f"{role.value}@test.com",
        password_hash="x",
        role=role,
        status=UserStatus.ACTIVE,
        full_name="QA User",
        created_at=now,
        updated_at=now,
    )


class TestAssistantAdmissionEndpointQa:
    async def test_admission_case_summary_endpoint_returns_safe_payload(self) -> None:
        user = _user()
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user

        case_id = uuid4()
        overview = MagicMock()
        overview.case = MagicMock(
            id=case_id,
            status="documents_pending",
            current_stage="document_collection",
            created_at=datetime(2024, 1, 1, tzinfo=UTC),
            updated_at=datetime(2024, 1, 2, tzinfo=UTC),
        )
        overview.candidate = MagicMock(id=uuid4(), name="Candidato QA Admissional", cpf="00000000000", phone=None)
        overview.job = MagicMock(id=uuid4(), title="Analista QA Admissional")
        overview.status_label = "Documentos pendentes"
        overview.progress = MagicMock(total=4, approved=1, pending=2, rejected=1, in_review=0, waived=0)
        overview.integration_status = MagicMock(state="pending", label="Pendente", ready_for_export=False)
        overview.summary = MagicMock(ready_for_export=False, readiness_status="not_ready", responsible_name="Assistant QA Seed")
        overview.main_blocker = None
        overview.next_action = None
        overview.updated_at = datetime(2024, 1, 2, tzinfo=UTC)

        admission_service = MagicMock()
        admission_service.get_overview = AsyncMock(return_value=overview)

        try:
            with patch(
                "src.interface.api.routers.ai_assistant._build_services",
                return_value={"admission_service": admission_service},
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "admission.case_summary", "arguments": {"admission_case_id": str(case_id)}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        body = resp.json()
        assert resp.status_code == 200
        assert body["ok"] is True
        assert body["tool_name"] == "get_admission_case_summary"
        assert "cpf" not in str(body["data"]).lower()
        assert "phone" not in str(body["data"]).lower()

    async def test_admission_documents_status_endpoint_omits_review_notes_and_raw_content(self) -> None:
        user = _user()
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user

        case_id = uuid4()
        checklist = MagicMock(total=4, approved=1, pending=2, blocked=1)
        document = MagicMock(
            id=uuid4(),
            checklist_item_id=uuid4(),
            checklist_title="Dados bancários",
            required=True,
            filename="dados-bancarios-qa.pdf",
            document_type="dados_bancarios",
            mime_type="application/pdf",
            size_bytes=2048,
            status="rejected",
            uploaded_at=datetime(2024, 1, 1, tzinfo=UTC),
            reviewed_at=datetime(2024, 1, 2, tzinfo=UTC),
            reviewed_by_name="Assistant QA Seed",
            review_notes="nota interna sensível",
            rejection_reason_public="Reenvie os dados bancários em documento legível.",
            approved_at=None,
            is_current_for_item=True,
            ocr_text="ocr bruto proibido",
            raw_text="texto cru proibido",
        )
        docs_response = MagicMock(checklist=checklist, documents=[document])
        admission_service = MagicMock()
        admission_service.get_documents = AsyncMock(return_value=docs_response)

        try:
            with patch(
                "src.interface.api.routers.ai_assistant._build_services",
                return_value={"admission_service": admission_service},
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "admission.documents_status", "arguments": {"admission_case_id": str(case_id)}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        body = resp.json()
        assert resp.status_code == 200
        assert body["ok"] is True
        serialized = str(body["data"])
        for forbidden in ("review_notes", "ocr_text", "raw_text", "payload_json"):
            assert forbidden not in serialized

    async def test_admission_events_summary_endpoint_omits_payload_json(self) -> None:
        user = _user()
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user

        case_id = uuid4()
        event = MagicMock(
            id=uuid4(),
            type="document_uploaded",
            title="Documento enviado",
            description="Documento enviado pelo candidato.",
            actor_name="Assistant QA Seed",
            created_at=datetime(2024, 1, 1, tzinfo=UTC),
            payload_json={"cpf": "00000000000"},
        )
        events_response = MagicMock(items=[event], total=1, page=1, page_size=10, has_next=False)
        admission_service = MagicMock()
        admission_service.get_events = AsyncMock(return_value=events_response)

        try:
            with patch(
                "src.interface.api.routers.ai_assistant._build_services",
                return_value={"admission_service": admission_service},
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={
                            "intent": "admission.events_summary",
                            "arguments": {"admission_case_id": str(case_id), "page_size": 10},
                        },
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        body = resp.json()
        assert resp.status_code == 200
        assert body["ok"] is True
        assert "payload_json" not in str(body["data"])

    async def test_protheus_export_status_endpoint_omits_payload_json(self) -> None:
        user = _user()
        _fastapi_app.dependency_overrides[get_current_user] = lambda: user

        package_id = uuid4()
        package = MagicMock(
            id=package_id,
            case_id=uuid4(),
            candidate_id=uuid4(),
            job_id=uuid4(),
            status="approved_for_export",
            validation_errors_json=[],
            payload_json={"cpf": "00000000000"},
            created_at=datetime(2024, 1, 1, tzinfo=UTC),
            updated_at=datetime(2024, 1, 2, tzinfo=UTC),
            approved_at=datetime(2024, 1, 2, tzinfo=UTC),
            exported_at=None,
            cancelled_at=None,
        )
        package_service = MagicMock()
        package_service.get_export_payload = AsyncMock(return_value=package)

        try:
            with patch(
                "src.interface.api.routers.ai_assistant._build_services",
                return_value={"admission_package_service": package_service},
            ):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post(
                        _ENDPOINT,
                        json={"intent": "protheus.export_status", "arguments": {"package_id": str(package_id)}},
                    )
        finally:
            _fastapi_app.dependency_overrides.pop(get_current_user, None)

        body = resp.json()
        assert resp.status_code == 200
        assert body["ok"] is True
        assert "payload_json" not in str(body["data"])
