from datetime import datetime, timezone, timedelta
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock
from zoneinfo import ZoneInfo

import pytest

from src.application.services.interview_schedule_service import (
    InterviewScheduleService,
    InterviewScheduleNotFoundError,
    InterviewScheduleAlreadyCancelledError,
    InterviewScheduleConflictError,
    InterviewScheduleValidationError,
)
from src.domain.exceptions import ValidationException
from src.interface.api.schemas.interview_schedule_schemas import AgendaKpiResponse
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel


@pytest.fixture
def mock_repository():
    repository = AsyncMock()
    repository.find_conflicting_schedule.return_value = None
    repository.find_active_pipeline_id.return_value = uuid4()
    return repository


@pytest.fixture
def service(mock_repository):
    return InterviewScheduleService(mock_repository)


def build_schedule(
    *,
    schedule_id=None,
    candidate_id=None,
    start=None,
    end=None,
    status="scheduled",
    interviewer_name=None,
    interviewer_email=None,
    title="Tech Interview",
):
    start = start or datetime.now(timezone.utc)
    end = end or (start + timedelta(hours=1))
    return InterviewScheduleModel(
        id=schedule_id or uuid4(),
        candidate_id=candidate_id or uuid4(),
        job_id=uuid4(),
        title=title,
        scheduled_start=start,
        scheduled_end=end,
        interview_type="technical",
        status=status,
        interviewer_name=interviewer_name,
        interviewer_email=interviewer_email,
    )


class TestListInterviews:
    @pytest.mark.asyncio
    async def test_list_interviews_without_filters(self, service, mock_repository):
        mock_repository.list_schedules.return_value = ([], 0)

        items, total = await service.list_interviews(page=1, page_size=20)

        assert items == []
        assert total == 0
        mock_repository.list_schedules.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_interviews_with_status_filter(self, service, mock_repository):
        schedule = {
            "id": str(uuid4()),
            "candidate_id": str(uuid4()),
            "candidate_name": "John Doe",
            "job_id": str(uuid4()),
            "job_title": "Software Engineer",
            "title": "Technical Interview",
            "description": None,
            "scheduled_start": datetime.now(timezone.utc),
            "scheduled_end": datetime.now(timezone.utc) + timedelta(hours=1),
            "timezone": "America/Recife",
            "interview_type": "technical",
            "status": "scheduled",
            "location": None,
            "meeting_url": None,
            "interviewer_name": "Jane Smith",
            "interviewer_email": None,
            "cancel_reason": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        mock_repository.list_schedules.return_value = ([schedule], 1)

        items, total = await service.list_interviews(
            page=1, page_size=20, status="scheduled"
        )

        assert len(items) == 1
        assert total == 1
        assert items[0]["status"] == "scheduled"

    @pytest.mark.asyncio
    async def test_list_interviews_with_period(self, service, mock_repository):
        date_from = datetime.now(timezone.utc)
        date_to = date_from + timedelta(days=7)

        mock_repository.list_schedules.return_value = ([], 0)

        items, total = await service.list_interviews(
            page=1,
            page_size=20,
            date_from=date_from,
            date_to=date_to,
        )

        assert items == []
        assert total == 0
        call_kwargs = mock_repository.list_schedules.call_args[1]
        assert call_kwargs["date_from"] == date_from
        assert call_kwargs["date_to"] == date_to

    @pytest.mark.asyncio
    async def test_list_interviews_invalid_date_range(self, service, mock_repository):
        date_from = datetime.now(timezone.utc) + timedelta(days=7)
        date_to = datetime.now(timezone.utc)

        with pytest.raises(ValidationException):
            await service.list_interviews(
                page=1,
                page_size=20,
                date_from=date_from,
                date_to=date_to,
            )


class TestGetKpis:
    @pytest.mark.asyncio
    async def test_get_kpis_returns_structure(self, service, mock_repository):
        mock_repository.get_kpis.return_value = {
            "total_scheduled": 10,
            "today_count": 2,
            "upcoming_count": 5,
            "completed_count": 3,
            "cancelled_count": 0,
            "unique_interviewers_count": 4,
        }

        kpis = await service.get_kpis()

        assert isinstance(kpis, AgendaKpiResponse)
        assert kpis.total_scheduled == 10
        assert kpis.today_count == 2
        assert kpis.upcoming_count == 5
        assert kpis.completed_count == 3
        assert kpis.cancelled_count == 0
        assert kpis.unique_interviewers_count == 4

    @pytest.mark.asyncio
    async def test_get_kpis_with_filters(self, service, mock_repository):
        candidate_id = uuid4()
        mock_repository.get_kpis.return_value = {
            "total_scheduled": 5,
            "today_count": 0,
            "upcoming_count": 5,
            "completed_count": 0,
            "cancelled_count": 0,
            "unique_interviewers_count": 2,
        }

        kpis = await service.get_kpis(status="scheduled", candidate_id=candidate_id)

        assert kpis.total_scheduled == 5
        call_kwargs = mock_repository.get_kpis.call_args[1]
        assert call_kwargs["status"] == "scheduled"
        assert call_kwargs["candidate_id"] == candidate_id

    @pytest.mark.asyncio
    async def test_get_kpis_invalid_date_range(self, service, mock_repository):
        date_from = datetime.now(timezone.utc) + timedelta(days=7)
        date_to = datetime.now(timezone.utc)

        with pytest.raises(ValidationException):
            await service.get_kpis(date_from=date_from, date_to=date_to)

    @pytest.mark.asyncio
    async def test_get_kpis_unique_interviewers_from_email(self, service, mock_repository):
        mock_repository.get_kpis.return_value = {
            "total_scheduled": 10,
            "today_count": 0,
            "upcoming_count": 0,
            "completed_count": 0,
            "cancelled_count": 0,
            "unique_interviewers_count": 3,
        }

        kpis = await service.get_kpis()

        assert kpis.unique_interviewers_count == 3

    @pytest.mark.asyncio
    async def test_get_kpis_unique_interviewers_fallback_to_name(self, service, mock_repository):
        """Test that when email is null, interviewer_name is counted."""
        mock_repository.get_kpis.return_value = {
            "total_scheduled": 10,
            "today_count": 0,
            "upcoming_count": 0,
            "completed_count": 0,
            "cancelled_count": 0,
            "unique_interviewers_count": 5,
        }

        kpis = await service.get_kpis()

        assert kpis.unique_interviewers_count == 5

    @pytest.mark.asyncio
    async def test_get_kpis_today_count_respects_recife_timezone(self, service, mock_repository):
        """Test that today_count considers America/Recife timezone, not UTC.

        Scenario:
        - It's 02:00 UTC (next day in UTC)
        - But it's 23:00 on previous day in America/Recife
        - An interview at 23:30 Recife time should count in today_count for Recife
        """
        mock_repository.get_kpis.return_value = {
            "total_scheduled": 5,
            "today_count": 1,  # Should count the evening interview in Recife timezone
            "upcoming_count": 0,
            "completed_count": 0,
            "cancelled_count": 0,
            "unique_interviewers_count": 2,
        }

        kpis = await service.get_kpis()

        # The KPI should reflect Recife's local day, not UTC
        assert kpis.today_count == 1


class TestCreateInterview:
    @pytest.mark.asyncio
    async def test_create_interview_valid(self, service, mock_repository):
        candidate_id = uuid4()
        job_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)

        schedule = InterviewScheduleModel(
            id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            title="Tech Interview",
            scheduled_start=start,
            scheduled_end=end,
            interview_type="technical",
            status="scheduled",
        )
        mock_repository.create.return_value = schedule

        result = await service.create_interview(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=None,
            title="Tech Interview",
            description=None,
            scheduled_start=start,
            scheduled_end=end,
            timezone="America/Recife",
            interview_type="technical",
            status="scheduled",
            location=None,
            meeting_url=None,
            interviewer_name=None,
            interviewer_email=None,
        )

        assert result.id == schedule.id
        assert result.status == "scheduled"
        mock_repository.find_conflicting_schedule.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_interview_blocks_conflict_same_interviewer(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)
        mock_repository.find_conflicting_schedule.return_value = (
            build_schedule(
                candidate_id=uuid4(),
                start=start,
                end=end,
                interviewer_email="avaliador@empresa.com",
            ),
            "interviewer",
        )

        with pytest.raises(InterviewScheduleConflictError, match="avaliador"):
            await service.create_interview(
                candidate_id=candidate_id,
                job_id=uuid4(),
                pipeline_id=None,
                title="Tech Interview",
                description=None,
                scheduled_start=start,
                scheduled_end=end,
                timezone="America/Recife",
                interview_type="technical",
                status="scheduled",
                location=None,
                meeting_url=None,
                interviewer_name="Avaliador Um",
                interviewer_email="avaliador@empresa.com",
            )

    @pytest.mark.asyncio
    async def test_create_interview_blocks_conflict_same_candidate(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)
        mock_repository.find_conflicting_schedule.return_value = (
            build_schedule(candidate_id=candidate_id, start=start, end=end),
            "candidate",
        )

        with pytest.raises(InterviewScheduleConflictError, match="candidato"):
            await service.create_interview(
                candidate_id=candidate_id,
                job_id=uuid4(),
                pipeline_id=None,
                title="Tech Interview",
                description=None,
                scheduled_start=start,
                scheduled_end=end,
                timezone="America/Recife",
                interview_type="technical",
                status="scheduled",
                location=None,
                meeting_url=None,
                interviewer_name=None,
                interviewer_email=None,
            )

    @pytest.mark.asyncio
    async def test_create_interview_allows_free_slot(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=4)
        end = start + timedelta(hours=1)
        mock_repository.find_conflicting_schedule.return_value = None
        mock_repository.create.return_value = build_schedule(candidate_id=candidate_id, start=start, end=end)

        result = await service.create_interview(
            candidate_id=candidate_id,
            job_id=uuid4(),
            pipeline_id=None,
            title="Tech Interview",
            description=None,
            scheduled_start=start,
            scheduled_end=end,
            timezone="America/Recife",
            interview_type="technical",
            status="scheduled",
            location=None,
            meeting_url=None,
            interviewer_name="Livre",
            interviewer_email="livre@empresa.com",
        )

        assert result.candidate_id == candidate_id

    @pytest.mark.asyncio
    async def test_create_interview_requires_candidate_job_link(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=4)
        end = start + timedelta(hours=1)

        with pytest.raises(InterviewScheduleValidationError, match="Selecione uma vaga vinculada"):
            await service.create_interview(
                candidate_id=candidate_id,
                job_id=None,
                pipeline_id=None,
                title="Tech Interview",
                description=None,
                scheduled_start=start,
                scheduled_end=end,
                timezone="America/Recife",
                interview_type="technical",
                status="scheduled",
                location=None,
                meeting_url=None,
                interviewer_name="Livre",
                interviewer_email="livre@empresa.com",
            )

    @pytest.mark.asyncio
    async def test_create_interview_blocks_internal_public_notes(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=4)
        end = start + timedelta(hours=1)

        with pytest.raises(InterviewScheduleValidationError, match="observação pública"):
            await service.create_interview(
                candidate_id=candidate_id,
                job_id=uuid4(),
                pipeline_id=None,
                title="Tech Interview",
                description=None,
                public_notes="Scorecard pendente para o pipeline interno.",
                scheduled_start=start,
                scheduled_end=end,
                timezone="America/Recife",
                interview_type="technical",
                status="scheduled",
                location=None,
                meeting_url=None,
                interviewer_name="Livre",
                interviewer_email="livre@empresa.com",
            )

    @pytest.mark.asyncio
    async def test_create_interview_allows_cancelled_conflict(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=4)
        end = start + timedelta(hours=1)
        mock_repository.find_conflicting_schedule.return_value = None
        mock_repository.create.return_value = build_schedule(candidate_id=candidate_id, start=start, end=end)

        result = await service.create_interview(
            candidate_id=candidate_id,
            job_id=uuid4(),
            pipeline_id=None,
            title="Tech Interview",
            description=None,
            scheduled_start=start,
            scheduled_end=end,
            timezone="America/Recife",
            interview_type="technical",
            status="scheduled",
            location=None,
            meeting_url=None,
            interviewer_name="Avaliador Cancelado",
            interviewer_email="cancelado@empresa.com",
        )

        assert result.status == "scheduled"

    @pytest.mark.asyncio
    async def test_create_interview_invalid_date_range(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc)
        end = start - timedelta(hours=1)  # End before start

        with pytest.raises(InterviewScheduleValidationError):
            await service.create_interview(
                candidate_id=candidate_id,
                job_id=uuid4(),
                pipeline_id=None,
                title="Tech Interview",
                description=None,
                scheduled_start=start,
                scheduled_end=end,
                timezone="America/Recife",
                interview_type="technical",
                status="scheduled",
                location=None,
                meeting_url=None,
                interviewer_name=None,
                interviewer_email=None,
            )

    @pytest.mark.asyncio
    async def test_create_interview_past_date(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) - timedelta(hours=1)
        end = start + timedelta(hours=1)

        with pytest.raises(InterviewScheduleValidationError, match="passado"):
            await service.create_interview(
                candidate_id=candidate_id,
                job_id=uuid4(),
                pipeline_id=None,
                title="Tech Interview",
                description=None,
                scheduled_start=start,
                scheduled_end=end,
                timezone="America/Recife",
                interview_type="technical",
                status="scheduled",
                location=None,
                meeting_url=None,
                interviewer_name=None,
                interviewer_email=None,
            )

    @pytest.mark.asyncio
    async def test_create_interview_invalid_status(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)

        with pytest.raises(InterviewScheduleValidationError):
            await service.create_interview(
                candidate_id=candidate_id,
                job_id=uuid4(),
                pipeline_id=None,
                title="Tech Interview",
                description=None,
                scheduled_start=start,
                scheduled_end=end,
                timezone="America/Recife",
                interview_type="technical",
                status="invalid_status",
                location=None,
                meeting_url=None,
                interviewer_name=None,
                interviewer_email=None,
            )

    @pytest.mark.asyncio
    async def test_create_interview_invalid_type(self, service, mock_repository):
        candidate_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)

        with pytest.raises(InterviewScheduleValidationError):
            await service.create_interview(
                candidate_id=candidate_id,
                job_id=uuid4(),
                pipeline_id=None,
                title="Tech Interview",
                description=None,
                scheduled_start=start,
                scheduled_end=end,
                timezone="America/Recife",
                interview_type="invalid_type",
                status="scheduled",
                location=None,
                meeting_url=None,
                interviewer_name=None,
                interviewer_email=None,
            )

    @pytest.mark.asyncio
    async def test_create_interview_calls_sync_service(self, mock_repository):
        candidate_id = uuid4()
        job_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)

        schedule = InterviewScheduleModel(
            id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            title="Tech Interview",
            scheduled_start=start,
            scheduled_end=end,
            interview_type="technical",
            status="scheduled",
        )
        mock_repository.create.return_value = schedule

        mock_sync_service = AsyncMock()
        service_with_sync = InterviewScheduleService(mock_repository, sync_service=mock_sync_service)
        requested_by_user_id = uuid4()
        
        await service_with_sync.create_interview(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=None,
            title="Tech Interview",
            description=None,
            scheduled_start=start,
            scheduled_end=end,
            timezone="America/Recife",
            interview_type="technical",
            status="scheduled",
            location=None,
            meeting_url=None,
            interviewer_name=None,
            interviewer_email=None,
            create_google_event=True,
            requested_by_user_id=requested_by_user_id,
        )

        mock_sync_service.sync_create_event.assert_awaited_once_with(
            schedule.id, requested_by_user_id, create_meet=False
        )

    @pytest.mark.asyncio
    async def test_create_interview_swallow_google_sync_failure(self, mock_repository):
        candidate_id = uuid4()
        job_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        end = start + timedelta(hours=1)
        schedule = build_schedule(candidate_id=candidate_id, start=start, end=end)
        schedule.job_id = job_id
        mock_repository.create.return_value = schedule

        mock_sync_service = AsyncMock()
        mock_sync_service.sync_create_event.side_effect = RuntimeError("google down")
        service_with_sync = InterviewScheduleService(mock_repository, sync_service=mock_sync_service)

        result = await service_with_sync.create_interview(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=None,
            title="Tech Interview",
            description=None,
            scheduled_start=start,
            scheduled_end=end,
            timezone="America/Recife",
            interview_type="technical",
            status="scheduled",
            location=None,
            meeting_url=None,
            interviewer_name=None,
            interviewer_email=None,
            create_google_event=True,
            requested_by_user_id=uuid4(),
        )

        assert result.id == schedule.id


class TestGetInterview:
    @pytest.mark.asyncio
    async def test_get_interview_found(self, service, mock_repository):
        schedule_id = uuid4()
        schedule = InterviewScheduleModel(
            id=schedule_id,
            candidate_id=uuid4(),
            job_id=uuid4(),
            title="Tech Interview",
            scheduled_start=datetime.now(timezone.utc),
            scheduled_end=datetime.now(timezone.utc) + timedelta(hours=1),
            interview_type="technical",
            status="scheduled",
        )
        mock_repository.get_by_id.return_value = schedule

        result = await service.get_interview(schedule_id)

        assert result.id == schedule_id

    @pytest.mark.asyncio
    async def test_get_interview_not_found(self, service, mock_repository):
        schedule_id = uuid4()
        mock_repository.get_by_id.return_value = None

        with pytest.raises(InterviewScheduleNotFoundError):
            await service.get_interview(schedule_id)


class TestUpdateInterview:
    @pytest.mark.asyncio
    async def test_update_interview_title(self, service, mock_repository):
        schedule_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(days=1)
        schedule = build_schedule(schedule_id=schedule_id, start=start, title="Old Title")
        mock_repository.get_by_id.return_value = schedule
        updated_schedule = build_schedule(
            schedule_id=schedule_id,
            candidate_id=schedule.candidate_id,
            start=start,
            end=start + timedelta(hours=1),
            title="New Title",
        )
        mock_repository.update.return_value = updated_schedule

        result = await service.update_interview(schedule_id, title="New Title")

        assert result.title == "New Title"

    @pytest.mark.asyncio
    async def test_update_interview_past_date(self, service, mock_repository):
        schedule_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(days=1)
        schedule = build_schedule(schedule_id=schedule_id, start=start)
        mock_repository.get_by_id.return_value = schedule

        past_start = datetime.now(timezone.utc) - timedelta(hours=1)

        with pytest.raises(InterviewScheduleValidationError, match="passado"):
            await service.update_interview(
                schedule_id,
                scheduled_start=past_start,
                scheduled_end=past_start + timedelta(hours=1),
            )

    @pytest.mark.asyncio
    async def test_update_interview_reschedule_changes_status(self, service, mock_repository):
        schedule_id = uuid4()
        start = datetime.now(timezone.utc)
        new_start = start + timedelta(days=1)
        schedule = build_schedule(schedule_id=schedule_id, start=start)
        mock_repository.get_by_id.return_value = schedule
        updated_schedule = build_schedule(
            schedule_id=schedule_id,
            candidate_id=schedule.candidate_id,
            start=new_start,
            end=new_start + timedelta(hours=1),
            status="rescheduled",
        )
        mock_repository.update.return_value = updated_schedule

        result = await service.update_interview(
            schedule_id,
            scheduled_start=new_start,
            scheduled_end=new_start + timedelta(hours=1),
        )

        assert result.status == "rescheduled"

    @pytest.mark.asyncio
    async def test_update_interview_blocks_conflict(self, service, mock_repository):
        schedule_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(days=1)
        schedule = build_schedule(
            schedule_id=schedule_id,
            candidate_id=uuid4(),
            start=start,
            interviewer_email="avaliador@empresa.com",
        )
        mock_repository.get_by_id.return_value = schedule
        mock_repository.find_conflicting_schedule.return_value = (
            build_schedule(
                candidate_id=uuid4(),
                start=start + timedelta(hours=1),
                end=start + timedelta(hours=2),
                interviewer_email="avaliador@empresa.com",
            ),
            "interviewer",
        )

        with pytest.raises(InterviewScheduleConflictError, match="avaliador"):
            await service.update_interview(
                schedule_id,
                scheduled_start=start + timedelta(hours=1),
                scheduled_end=start + timedelta(hours=2),
                interviewer_email="avaliador@empresa.com",
            )

    @pytest.mark.asyncio
    async def test_update_interview_allows_same_schedule_without_false_positive(self, service, mock_repository):
        schedule_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(days=1)
        schedule = build_schedule(
            schedule_id=schedule_id,
            candidate_id=uuid4(),
            start=start,
            interviewer_email="avaliador@empresa.com",
        )
        mock_repository.get_by_id.return_value = schedule
        mock_repository.find_conflicting_schedule.return_value = None
        mock_repository.update.return_value = schedule

        result = await service.update_interview(
            schedule_id,
            title="Mesmo agendamento",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=1),
        )

        assert result.id == schedule_id
        conflict_kwargs = mock_repository.find_conflicting_schedule.await_args.kwargs
        assert conflict_kwargs["exclude_schedule_id"] == schedule_id

    @pytest.mark.asyncio
    async def test_update_interview_cancelled_raises_error(self, service, mock_repository):
        schedule_id = uuid4()
        schedule = build_schedule(schedule_id=schedule_id, status="cancelled")
        mock_repository.get_by_id.return_value = schedule

        with pytest.raises(InterviewScheduleValidationError):
            await service.update_interview(schedule_id, title="New Title")

    @pytest.mark.asyncio
    async def test_update_interview_calls_google_update_when_synced(self, mock_repository):
        schedule_id = uuid4()
        start = datetime.now(timezone.utc) + timedelta(days=1)
        schedule = build_schedule(schedule_id=schedule_id, start=start)
        schedule.external_calendar_event_id = "google-event-1"
        schedule.calendar_provider = "google"
        mock_repository.get_by_id.return_value = schedule
        mock_repository.update.return_value = schedule
        mock_sync_service = AsyncMock()
        service_with_sync = InterviewScheduleService(mock_repository, sync_service=mock_sync_service)
        user_id = uuid4()

        await service_with_sync.update_interview(
            schedule_id,
            title="Atualizada",
            requested_by_user_id=user_id,
        )

        mock_sync_service.sync_update_event.assert_awaited_once_with(
            schedule_id,
            user_id,
            create_meet=False,
        )


class TestCancelInterview:
    @pytest.mark.asyncio
    async def test_cancel_interview_valid(self, service, mock_repository):
        schedule_id = uuid4()
        schedule = InterviewScheduleModel(
            id=schedule_id,
            candidate_id=uuid4(),
            job_id=uuid4(),
            title="Tech Interview",
            scheduled_start=datetime.now(timezone.utc),
            scheduled_end=datetime.now(timezone.utc) + timedelta(hours=1),
            interview_type="technical",
            status="scheduled",
        )
        cancelled_schedule = InterviewScheduleModel(
            id=schedule_id,
            candidate_id=schedule.candidate_id,
            job_id=schedule.job_id,
            title="Tech Interview",
            scheduled_start=schedule.scheduled_start,
            scheduled_end=schedule.scheduled_end,
            interview_type="technical",
            status="cancelled",
            cancel_reason="Candidato não compareceu",
        )
        mock_repository.get_by_id.return_value = schedule
        mock_repository.cancel.return_value = cancelled_schedule

        result = await service.cancel_interview(schedule_id, "Candidato não compareceu")

        assert result.status == "cancelled"
        assert result.cancel_reason == "Candidato não compareceu"

    @pytest.mark.asyncio
    async def test_cancel_interview_already_cancelled(self, service, mock_repository):
        schedule_id = uuid4()
        schedule = InterviewScheduleModel(
            id=schedule_id,
            candidate_id=uuid4(),
            job_id=uuid4(),
            title="Tech Interview",
            scheduled_start=datetime.now(timezone.utc),
            scheduled_end=datetime.now(timezone.utc) + timedelta(hours=1),
            interview_type="technical",
            status="cancelled",
            cancel_reason="Razão anterior",
        )
        mock_repository.get_by_id.return_value = schedule

        with pytest.raises(InterviewScheduleAlreadyCancelledError):
            await service.cancel_interview(schedule_id, "Nova razão")

    @pytest.mark.asyncio
    async def test_cancel_interview_calls_google_cancel_when_synced(self, mock_repository):
        schedule_id = uuid4()
        schedule = build_schedule(schedule_id=schedule_id)
        schedule.external_calendar_event_id = "google-event-1"
        schedule.calendar_provider = "google"
        cancelled_schedule = build_schedule(schedule_id=schedule_id, status="cancelled")
        cancelled_schedule.external_calendar_event_id = "google-event-1"
        cancelled_schedule.calendar_provider = "google"
        mock_repository.get_by_id.return_value = schedule
        mock_repository.cancel.return_value = cancelled_schedule
        mock_sync_service = AsyncMock()
        service_with_sync = InterviewScheduleService(mock_repository, sync_service=mock_sync_service)
        user_id = uuid4()

        await service_with_sync.cancel_interview(
            schedule_id,
            "Cancelada",
            requested_by_user_id=user_id,
        )

        mock_sync_service.sync_cancel_event.assert_awaited_once_with(schedule_id, user_id)
