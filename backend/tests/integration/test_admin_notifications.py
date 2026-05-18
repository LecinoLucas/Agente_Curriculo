from __future__ import annotations

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4
from datetime import datetime, timezone, timedelta

from src.core.settings import settings

# Fase 30B — cluster de notificações admin (alertas Redis/Calendar/etc.) é
# observabilidade, não caminho crítico. Sai do smoke; segue em regression
# local e CI completo via `-m "not slow"` excluído ou rodar diretamente.
pytestmark = pytest.mark.slow
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import AnalysisModel, AIModelModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.application.services.admin_notification_service import AdminNotificationService

from .helpers import _auth_headers, _create_active_user


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "admin-notifications@test.com", "password123", UserRole.ADMIN)
    return await _auth_headers(client, "admin-notifications@test.com", "password123")


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "recruiter-notifications@test.com", "password123", UserRole.RECRUITER)
    return await _auth_headers(client, "recruiter-notifications@test.com", "password123")


@pytest.mark.asyncio
async def test_admin_only_access(client: AsyncClient, db_session: AsyncSession):
    # Admin access
    headers = await _admin_headers(client, db_session)
    response = await client.get("/api/v1/admin/notifications", headers=headers)
    assert response.status_code == 200

    # Recruiter access
    rec_headers = await _recruiter_headers(client, db_session)
    response2 = await client.get("/api/v1/admin/notifications", headers=rec_headers)
    assert response2.status_code == 403


@pytest.mark.asyncio
async def test_redis_down_generates_critical_alert(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = await _admin_headers(client, db_session)

    # Force Redis to report 'down'
    async def mock_redis_health(self):
        return "down"

    monkeypatch.setattr(AdminNotificationService, "_check_redis_health", mock_redis_health)

    response = await client.get("/api/v1/admin/notifications", headers=headers)
    assert response.status_code == 200
    notifications = response.json()
    
    redis_alert = next((n for n in notifications if n["id"] == "health-redis-down"), None)
    assert redis_alert is not None
    assert redis_alert["type"] == "error"
    assert redis_alert["category"] == "health"
    assert "Redis Indisponível" in redis_alert["title"]


@pytest.mark.asyncio
async def test_pending_queue_without_workers_generates_critical_alert(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = await _admin_headers(client, db_session)

    # Force 0 Celery workers online
    async def mock_workers_online(self):
        return 0

    # Force 5 pending analyses
    async def mock_pending_analyses(self):
        return 5

    monkeypatch.setattr(AdminNotificationService, "_get_workers_online", mock_workers_online)
    monkeypatch.setattr(AdminNotificationService, "_count_pending_analyses", mock_pending_analyses)

    response = await client.get("/api/v1/admin/notifications", headers=headers)
    assert response.status_code == 200
    notifications = response.json()

    queue_alert = next((n for n in notifications if n["id"] == "health-queue-no-worker"), None)
    assert queue_alert is not None
    assert queue_alert["type"] == "error"
    assert queue_alert["category"] == "queue"
    assert "Fila de IA sem Workers ativos" in queue_alert["title"]


@pytest.mark.asyncio
async def test_failed_calendar_sync_generates_warning_alert(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _admin_headers(client, db_session)

    # Insert a failed Google Calendar sync InterviewSchedule
    schedule = InterviewScheduleModel(
        candidate_id=uuid4(),
        job_id=uuid4(),
        pipeline_id=uuid4(),
        title="Entrevista Técnica Super Secreta",
        interview_format="online",
        scheduled_start=datetime.now(timezone.utc),
        scheduled_end=datetime.now(timezone.utc) + timedelta(hours=1),
        interview_type="technical",
        status="scheduled",
        calendar_sync_status="failed",
        calendar_sync_error="Erro fatal oauth token 12345abcdefg super_secret_token_abc123",
    )
    db_session.add(schedule)
    await db_session.commit()

    response = await client.get("/api/v1/admin/notifications", headers=headers)
    assert response.status_code == 200
    notifications = response.json()

    calendar_alert = next((n for n in notifications if n["id"] == f"calendar-failed-{schedule.id}"), None)
    assert calendar_alert is not None
    assert calendar_alert["type"] == "warning"
    assert calendar_alert["category"] == "calendar"
    assert "Falha de sincronização na agenda" in calendar_alert["title"]
    
    # Assert payload does not expose keys or secrets
    assert "super_secret_token_abc123" not in response.text
    assert "[REDACTED_SECRET]" in calendar_alert["description"]
