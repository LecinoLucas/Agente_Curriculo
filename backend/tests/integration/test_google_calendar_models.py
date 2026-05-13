import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy.exc import IntegrityError
from src.infrastructure.database.models.google_calendar_connection_model import GoogleCalendarConnectionModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.user_model import UserModel
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_google_calendar_connection_uniqueness(db_session: AsyncSession):
    """Garante que só exista uma conexão ativa por usuário."""
    # Criar usuário real para a FK
    user = UserModel(
        id=uuid4(),
        email=f"user_{uuid4().hex}@example.com",
        password_hash="hash",
        full_name="User Test",
        role="recruiter"
    )
    db_session.add(user)
    await db_session.commit()
    user_id = user.id
    
    # Criar primeira conexão ativa
    conn1 = GoogleCalendarConnectionModel(
        user_id=user_id,
        google_account_email="user@gmail.com",
        access_token_encrypted="token1",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(conn1)
    await db_session.commit()
    
    # Tentar criar segunda conexão ativa para o mesmo usuário
    conn2 = GoogleCalendarConnectionModel(
        user_id=user_id,
        google_account_email="user@gmail.com",
        access_token_encrypted="token2",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(conn2)
    
    with pytest.raises(IntegrityError):
        await db_session.commit()
        
    await db_session.rollback()

@pytest.mark.asyncio
async def test_google_calendar_connection_allow_new_if_revoked(db_session: AsyncSession):
    """Permite nova conexão se a anterior estiver revogada."""
    # Criar usuário real para a FK
    user = UserModel(
        id=uuid4(),
        email=f"user_{uuid4().hex}@example.com",
        password_hash="hash",
        full_name="User Test",
        role="recruiter"
    )
    db_session.add(user)
    await db_session.commit()
    user_id = user.id
    
    # Criar primeira conexão revogada
    conn1 = GoogleCalendarConnectionModel(
        user_id=user_id,
        google_account_email="user@gmail.com",
        access_token_encrypted="token1",
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        revoked_at=datetime.now(timezone.utc),
    )
    db_session.add(conn1)
    await db_session.commit()
    
    # Criar segunda conexão ativa para o mesmo usuário
    conn2 = GoogleCalendarConnectionModel(
        user_id=user_id,
        google_account_email="user@gmail.com",
        access_token_encrypted="token2",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(conn2)
    await db_session.commit() # Deve passar!
    
    assert conn2.id is not None

@pytest.mark.asyncio
async def test_interview_schedule_defaults(db_session: AsyncSession):
    """Valida valores padrão para novos campos de entrevista."""
    # Criar uma entrevista mínima
    interview = InterviewScheduleModel(
        candidate_id=uuid4(),
        title="Entrevista Teste",
        scheduled_start=datetime.now(timezone.utc) + timedelta(days=1),
        scheduled_end=datetime.now(timezone.utc) + timedelta(days=1, hours=1),
        interview_type="technical",
        interview_format="online",
        status="scheduled",
    )
    db_session.add(interview)
    await db_session.commit()
    
    # Recarregar
    await db_session.refresh(interview)
    
    assert interview.calendar_provider == "internal"
    assert interview.meeting_provider == "none"
    assert interview.calendar_sync_status == "not_synced"
