from datetime import datetime, timezone
from uuid import UUID, uuid4
from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from src.infrastructure.database.base import Base


class CalendarSyncEventModel(Base):
    __tablename__ = "calendar_sync_events"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    interview_schedule_id = Column(PG_UUID(as_uuid=True), ForeignKey("interview_schedules.id"), nullable=False)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    provider = Column(String(50), nullable=False, default="google")
    action = Column(String(50), nullable=False)  # create, update, cancel, refresh_token
    status = Column(String(50), nullable=False)  # requested, skipped, success, failed
    external_calendar_event_id = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    idempotency_key = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_calendar_sync_events_idempotency_key"),
    )
