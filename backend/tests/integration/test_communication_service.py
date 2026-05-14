"""Integration tests for communication service."""

import pytest
import sqlalchemy as sa
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.communication_service import CommunicationService
from src.infrastructure.repositories.sqlalchemy_communication_repository import (
    SQLAlchemyCommunicationRepository,
)
from src.infrastructure.database.models import (
    CommunicationDeliveryAttemptModel,
    CommunicationTemplateModel,
)


@pytest.fixture
async def communication_templates(db_session: AsyncSession):
    """Seed communication templates for testing."""
    templates_data = [
        {
            "key": "candidate_applied",
            "channel": "internal",
            "audience": "candidate",
            "subject_template": "Candidatura recebida",
            "body_template": "Olá {candidate_name}, sua candidatura para a vaga {job_title} foi recebida com sucesso.",
            "status": "active",
        },
        {
            "key": "interview_scheduled",
            "channel": "internal",
            "audience": "candidate",
            "subject_template": "Entrevista agendada",
            "body_template": "Olá {candidate_name}, sua entrevista para a vaga {job_title} foi agendada para {scheduled_start}.",
            "status": "active",
        },
        {
            "key": "interview_rescheduled",
            "channel": "internal",
            "audience": "candidate",
            "subject_template": "Entrevista remarcada",
            "body_template": "Olá {candidate_name}, sua entrevista para a vaga {job_title} foi remarcada para {scheduled_start}.",
            "status": "active",
        },
        {
            "key": "interview_cancelled",
            "channel": "internal",
            "audience": "candidate",
            "subject_template": "Entrevista cancelada",
            "body_template": "Olá {candidate_name}, sua entrevista para a vaga {job_title} foi cancelada.",
            "status": "active",
        },
        {
            "key": "interview_no_show",
            "channel": "internal",
            "audience": "recruiter",
            "subject_template": "Candidato não compareceu",
            "body_template": "O candidato {candidate_name} não compareceu à entrevista para a vaga {job_title}.",
            "status": "active",
        },
        {
            "key": "interview_awaiting_feedback",
            "channel": "internal",
            "audience": "recruiter",
            "subject_template": "Aguardando feedback da entrevista",
            "body_template": "Entrevista com {candidate_name} para a vaga {job_title} realizada. Aguardando feedback.",
            "status": "active",
        },
        {
            "key": "hiring_decision_submitted",
            "channel": "internal",
            "audience": "hr",
            "subject_template": "Decisão de contratação registrada",
            "body_template": "Uma decisão de contratação foi registrada para {candidate_name} na vaga {job_title}.",
            "status": "active",
        },
        {
            "key": "pre_admission_created",
            "channel": "internal",
            "audience": "candidate",
            "subject_template": "Processo de pré-admissão iniciado",
            "body_template": "Olá {candidate_name}, o seu processo de pré-admissão foi iniciado. Verifique os documentos necessários.",
            "status": "active",
        },
        {
            "key": "document_rejected",
            "channel": "internal",
            "audience": "candidate",
            "subject_template": "Documento com pendência",
            "body_template": "Olá {candidate_name}, o documento {document_type} foi devolvido com observação. Verifique os detalhes.",
            "status": "active",
        },
        {
            "key": "admission_package_approved",
            "channel": "internal",
            "audience": "hr",
            "subject_template": "Pacote admissional aprovado",
            "body_template": "O pacote admissional para {candidate_name} na vaga {job_title} foi aprovado.",
            "status": "active",
        },
    ]

    for template_data in templates_data:
        template = CommunicationTemplateModel(**template_data)
        db_session.add(template)

    await db_session.commit()
    return templates_data


@pytest.mark.asyncio
async def test_cria_comunicacao_para_candidate_applied(
    db_session: AsyncSession, communication_templates
):
    """Create a communication for candidate_applied event and verify delivery attempt."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()
    resume_id = uuid4()

    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate_id,
        job_id=job_id,
        related_entity_type="resume",
        related_entity_id=resume_id,
        context={
            "candidate_name": "João Silva",
            "job_title": "Engenheiro de Software",
        },
    )

    # Verify communication was created
    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    assert len(comms) == 1
    assert comms[0].template_key == "candidate_applied"
    assert comms[0].status == "sent"
    assert "João Silva" in comms[0].body
    assert "Engenheiro de Software" in comms[0].body

    # Verify delivery attempt was created
    delivery_attempts = await db_session.execute(
        sa.select(CommunicationDeliveryAttemptModel).where(
            CommunicationDeliveryAttemptModel.communication_id == comms[0].id
        )
    )
    attempts = delivery_attempts.scalars().all()
    assert len(attempts) == 1
    assert attempts[0].provider == "mock"
    assert attempts[0].status == "sent"


@pytest.mark.asyncio
async def test_cria_comunicacao_para_interview_scheduled(
    db_session: AsyncSession, communication_templates
):
    """Create a communication for interview_scheduled event."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()

    await service.notify_event(
        event_type="interview_scheduled",
        candidate_id=candidate_id,
        job_id=job_id,
        context={
            "candidate_name": "Maria Santos",
            "job_title": "Analista de Dados",
            "scheduled_start": "2026-05-20 10:00",
        },
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    assert len(comms) == 1
    assert comms[0].template_key == "interview_scheduled"
    assert comms[0].status == "sent"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event_type,audience",
    [
        ("interview_rescheduled", "candidate"),
        ("interview_cancelled", "candidate"),
        ("interview_no_show", "recruiter"),
        ("interview_awaiting_feedback", "recruiter"),
        ("pre_admission_created", "candidate"),
        ("document_rejected", "candidate"),
        ("admission_package_approved", "hr"),
    ],
)
async def test_eventos_restantes_criam_comunicacao_segura(
    db_session: AsyncSession, communication_templates, event_type: str, audience: str
):
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()
    entity_id = uuid4()

    await service.notify_event(
        event_type=event_type,
        candidate_id=candidate_id,
        job_id=job_id,
        related_entity_type="integration_test",
        related_entity_id=entity_id,
        context={
            "candidate_name": "Pessoa Candidata",
            "job_title": "Analista",
            "scheduled_start": "2026-05-20 10:00",
            "document_type": "CPF",
            "score": "99",
            "ranking": "1",
            "internal_ai_opinion": "parecer interno",
        },
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_recruiter(candidate_id, job_id)
    assert len(comms) == 1
    assert comms[0].template_key == event_type
    assert comms[0].audience == audience
    assert comms[0].status == "sent"
    assert "99" not in comms[0].body
    assert "ranking" not in comms[0].body.lower()
    assert "parecer interno" not in comms[0].body


@pytest.mark.asyncio
async def test_hiring_decision_submitted_nao_expoe_detalhes_sensiveis(
    db_session: AsyncSession, communication_templates
):
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()

    await service.notify_event(
        event_type="hiring_decision_submitted",
        candidate_id=candidate_id,
        job_id=job_id,
        related_entity_type="hiring_decision",
        related_entity_id=uuid4(),
        context={
            "candidate_name": "Pessoa Candidata",
            "job_title": "Analista",
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Decisão interna sensível",
            "score": "100",
            "ranking": "1",
        },
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_recruiter(candidate_id, job_id)
    assert len(comms) == 1
    body = comms[0].body.lower()
    assert "hire" not in body
    assert "strong_fit" not in body
    assert "decisão interna sensível" not in body
    assert "100" not in body
    assert "ranking" not in body


@pytest.mark.asyncio
async def test_nao_duplica_comunicacao_mesmo_evento(
    db_session: AsyncSession, communication_templates
):
    """Verify deduplication: second call for same event returns early."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()
    interview_id = uuid4()

    # First call
    await service.notify_event(
        event_type="interview_scheduled",
        candidate_id=candidate_id,
        job_id=job_id,
        related_entity_type="interview_schedule",
        related_entity_id=interview_id,
        context={"candidate_name": "Test", "job_title": "Test Job"},
    )

    # Second call - should not create duplicate
    await service.notify_event(
        event_type="interview_scheduled",
        candidate_id=candidate_id,
        job_id=job_id,
        related_entity_type="interview_schedule",
        related_entity_id=interview_id,
        context={"candidate_name": "Test", "job_title": "Test Job"},
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    assert len(comms) == 1


@pytest.mark.asyncio
async def test_falha_sem_template_nao_quebra_fluxo(db_session: AsyncSession):
    """Notification without template returns None without raising exception."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()

    # This should not raise - notify_event never raises
    await service.notify_event(
        event_type="nonexistent_template",
        candidate_id=candidate_id,
        context={},
    )

    # Verify no communication was created
    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    assert len(comms) == 0


@pytest.mark.asyncio
async def test_retry_de_failed_funciona(db_session: AsyncSession):
    """Test retry functionality for failed communications."""
    repo = SQLAlchemyCommunicationRepository(db_session)

    # Create a failed communication
    comm = await repo.create_communication(
        candidate_id=uuid4(),
        channel="internal",
        audience="candidate",
        body="Test message",
        status="failed",
    )
    assert comm.status == "failed"

    # Retry it
    service = CommunicationService(db_session)
    await service.retry_communication(comm.id)

    # Verify it's now sent
    comm_updated = await repo.get_communication_by_id(comm.id)
    assert comm_updated.status == "sent"
    assert comm_updated.error_message is None


@pytest.mark.asyncio
async def test_candidato_so_ve_suas_comunicacoes(
    db_session: AsyncSession, communication_templates
):
    """Candidate only sees communications addressed to them."""
    service = CommunicationService(db_session)
    candidate1_id = uuid4()
    candidate2_id = uuid4()
    job_id = uuid4()

    # Create notifications for both candidates
    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate1_id,
        job_id=job_id,
        context={"candidate_name": "Alice", "job_title": "Dev"},
    )

    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate2_id,
        job_id=job_id,
        context={"candidate_name": "Bob", "job_title": "Dev"},
    )

    # Candidate 1 should only see their own
    repo = SQLAlchemyCommunicationRepository(db_session)
    comms1 = await repo.list_for_candidate_audience(candidate1_id)
    assert len(comms1) == 1

    # Candidate 2 should only see their own
    comms2 = await repo.list_for_candidate_audience(candidate2_id)
    assert len(comms2) == 1


@pytest.mark.asyncio
async def test_comunicacao_nao_contem_score_ranking(
    db_session: AsyncSession, communication_templates
):
    """Communication body must not contain score or ranking data."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()

    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate_id,
        job_id=job_id,
        context={
            "candidate_name": "Test",
            "job_title": "Test Job",
            "score": "9.5",  # Should not appear
            "ranking": "1st",  # Should not appear
        },
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    assert len(comms) == 1

    # Score and ranking should not be in the body
    assert "9.5" not in comms[0].body
    assert "1st" not in comms[0].body


@pytest.mark.asyncio
async def test_mock_provider_registra_delivery_attempt(
    db_session: AsyncSession, communication_templates
):
    """Mock provider creates and records delivery attempts correctly."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()

    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate_id,
        job_id=job_id,
        context={"candidate_name": "Test", "job_title": "Test Job"},
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    comm_id = comms[0].id

    # Fetch delivery attempts
    stmt = sa.select(CommunicationDeliveryAttemptModel).where(
        CommunicationDeliveryAttemptModel.communication_id == comm_id
    )
    result = await db_session.execute(stmt)
    attempts = result.scalars().all()

    assert len(attempts) == 1
    assert attempts[0].provider == "mock"
    assert attempts[0].status == "sent"
    assert attempts[0].completed_at is not None


@pytest.mark.asyncio
async def test_mark_read_funciona(
    db_session: AsyncSession, communication_templates
):
    """Test mark_read functionality."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()

    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate_id,
        job_id=job_id,
        context={"candidate_name": "Test", "job_title": "Test"},
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    comm_id = comms[0].id

    # Initially sent, not read
    assert comms[0].status == "sent"
    assert comms[0].read_at is None

    # Mark as read
    await service.mark_read(comm_id, candidate_id)

    # Verify
    comm_updated = await repo.get_communication_by_id(comm_id)
    assert comm_updated.status == "read"
    assert comm_updated.read_at is not None


@pytest.mark.asyncio
async def test_list_for_recruiter_mostra_todas_comunicacoes(
    db_session: AsyncSession, communication_templates
):
    """Recruiter view shows all communications for a candidate-job pair."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()

    # Create notifications for different audiences
    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate_id,
        job_id=job_id,
        context={"candidate_name": "Test", "job_title": "Test"},
    )

    # List for recruiter should include the candidate_applied (audience=candidate)
    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_recruiter(candidate_id, job_id)
    assert len(comms) == 1


@pytest.mark.asyncio
async def test_template_rendering_com_missing_keys(
    db_session: AsyncSession, communication_templates
):
    """Template rendering handles missing keys gracefully."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    job_id = uuid4()

    # Pass incomplete context
    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate_id,
        job_id=job_id,
        context={
            "candidate_name": "Test",
            # missing job_title
        },
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    assert len(comms) == 1
    # Should contain placeholder for missing job_title
    assert "{job_title}" in comms[0].body


@pytest.mark.asyncio
async def test_mark_read_rejeita_candidato_errado(
    db_session: AsyncSession, communication_templates
):
    """mark_read rejects when candidate_id doesn't match."""
    service = CommunicationService(db_session)
    candidate_id = uuid4()
    other_candidate_id = uuid4()
    job_id = uuid4()

    await service.notify_event(
        event_type="candidate_applied",
        candidate_id=candidate_id,
        job_id=job_id,
        context={"candidate_name": "Test", "job_title": "Test"},
    )

    repo = SQLAlchemyCommunicationRepository(db_session)
    comms = await repo.list_for_candidate_audience(candidate_id)
    comm_id = comms[0].id

    # Try to mark as read with wrong candidate_id
    with pytest.raises(ValueError):
        await service.mark_read(comm_id, other_candidate_id)
