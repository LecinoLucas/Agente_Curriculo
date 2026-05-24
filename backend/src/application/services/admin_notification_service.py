from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from src.infrastructure.cache.redis_client import get_redis
from src.infrastructure.queue.celery_app import celery_app


class AdminNotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_notifications(self) -> list[dict]:
        notifications = []

        # 1. Check Redis status
        redis_status = await self._check_redis_health()
        if redis_status != "ok":
            notifications.append({
                "id": "health-redis-down",
                "title": "Redis Indisponível",
                "description": "O serviço de cache e broker Redis está fora do ar. Filas de análise e cache do sistema comprometidos.",
                "type": "error",
                "category": "health",
                "actionUrl": "/admin",
                "actionLabel": "Ver Diagnósticos",
            })

        # 2. Check pending queues and Celery workers
        workers_count = await self._get_workers_online()
        pending_analyses = await self._count_pending_analyses()

        if pending_analyses > 0 and (workers_count is None or workers_count == 0):
            notifications.append({
                "id": "health-queue-no-worker",
                "title": "Fila de IA sem Workers ativos",
                "description": f"Existem {pending_analyses} currículos aguardando análise de IA na fila, mas nenhum worker Celery está online para processá-los.",
                "type": "error",
                "category": "queue",
                "actionUrl": "/admin",
                "actionLabel": "Ver Diagnósticos",
            })

        # 3. Check AI provider operational state
        ai_rate_limit = await self._get_ai_provider_rate_limit()
        if ai_rate_limit is not None:
            notifications.append({
                "id": f"ai-provider-rate-limited-{ai_rate_limit['provider']}-{ai_rate_limit['model_id']}",
                "title": "IA temporariamente limitada",
                "description": "As análises automáticas estão pausadas por limite do provedor Gemini. O sistema continua funcionando e tentará novamente automaticamente.",
                "type": "warning",
                "category": "ai_provider",
                "actionUrl": "/admin",
                "actionLabel": "Ver Diagnósticos",
            })

        # 4. Check Google Calendar Sync Failures
        failed_calendar_syncs = await self._get_failed_calendar_syncs()
        for schedule_id, title, err in failed_calendar_syncs:
            safe_err = self._sanitize_error_message(err)
            notifications.append({
                "id": f"calendar-failed-{schedule_id}",
                "title": "Falha de sincronização na agenda",
                "description": f"Não foi possível sincronizar o compromisso '{title}': {safe_err}",
                "type": "warning",
                "category": "calendar",
                "actionUrl": "/agenda",
                "actionLabel": "Ver Agenda",
            })

        return notifications

    async def _check_redis_health(self) -> str:
        redis = None
        try:
            redis = await get_redis()
            ping = getattr(redis, "ping", None)
            if ping is None:
                return "ok"
            result = await ping()
            return "ok" if result is True else "degraded"
        except Exception:
            return "down"
        finally:
            if redis is not None and hasattr(redis, "aclose"):
                try:
                    await redis.aclose()
                except Exception:
                    pass

    async def _get_workers_online(self) -> int | None:
        def _inspect():
            try:
                inspector = celery_app.control.inspect(timeout=1.0)
                stats = inspector.stats()
                return len(stats) if stats else 0
            except Exception:
                return 0

        try:
            return await asyncio.to_thread(_inspect)
        except Exception:
            return 0

    async def _count_pending_analyses(self) -> int:
        from src.infrastructure.database.models.analysis_model import AnalysisModel
        return int(
            await self._db.scalar(
                sa.select(sa.func.count())
                .select_from(AnalysisModel)
                .where(AnalysisModel.status == "pending")
            )
            or 0
        )

    async def _get_ai_provider_rate_limit(self) -> dict | None:
        from src.infrastructure.database.models.ai_provider_health_model import AIProviderHealthModel

        row = await self._db.scalar(
            sa.select(AIProviderHealthModel)
            .where(
                AIProviderHealthModel.status == "rate_limited",
                sa.or_(
                    AIProviderHealthModel.cooldown_until.is_(None),
                    AIProviderHealthModel.cooldown_until > datetime.now(UTC),
                ),
            )
            .order_by(AIProviderHealthModel.updated_at.desc())
            .limit(1)
        )
        if row is None:
            return None
        return {"provider": row.provider, "model_id": row.model_id}

    async def _get_failed_calendar_syncs(self) -> list[tuple]:
        from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
        stmt = (
            sa.select(
                InterviewScheduleModel.id,
                InterviewScheduleModel.title,
                sa.func.coalesce(InterviewScheduleModel.calendar_sync_error, "Erro desconhecido"),
            )
            .where(InterviewScheduleModel.calendar_sync_status == "failed")
            .order_by(InterviewScheduleModel.created_at.desc())
        )
        rows = await self._db.execute(stmt)
        return [(str(r[0]), r[1], r[2]) for r in rows.all()]

    def _sanitize_error_message(self, message: str | None) -> str:
        if not message:
            return "Erro desconhecido"
        words = message.split()
        sanitized_words = []
        for word in words:
            clean_word = word.strip(".,;:()[]{}'\"")
            if len(clean_word) >= 20:
                sanitized_words.append("[REDACTED_SECRET]")
            else:
                sanitized_words.append(word)
        return " ".join(sanitized_words)
