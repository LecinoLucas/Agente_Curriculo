from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.google_calendar_connection_model import GoogleCalendarConnectionModel


class SQLAlchemyGoogleCalendarConnectionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_active_by_user_id(self, user_id: UUID) -> Optional[GoogleCalendarConnectionModel]:
        """Busca a conexão ativa do usuário."""
        result = await self._session.execute(
            sa.select(GoogleCalendarConnectionModel)
            .where(
                GoogleCalendarConnectionModel.user_id == user_id,
                GoogleCalendarConnectionModel.revoked_at.is_(None)
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def upsert_connection(
        self,
        user_id: UUID,
        google_account_email: str,
        access_token_encrypted: str,
        expires_at: datetime,
        refresh_token_encrypted: Optional[str] = None,
        scopes: Optional[str] = None,
    ) -> GoogleCalendarConnectionModel:
        """Cria ou atualiza a conexão ativa do usuário."""
        existing = await self.get_active_by_user_id(user_id)
        
        if existing:
            existing.google_account_email = google_account_email
            existing.access_token_encrypted = access_token_encrypted
            if refresh_token_encrypted:
                existing.refresh_token_encrypted = refresh_token_encrypted
            if scopes:
                existing.scopes = scopes
            existing.expires_at = expires_at
            existing.updated_at = datetime.now(timezone.utc)
            self._session.add(existing)
            await self._session.flush()
            await self._session.refresh(existing)
            return existing
        else:
            new_conn = GoogleCalendarConnectionModel(
                user_id=user_id,
                google_account_email=google_account_email,
                access_token_encrypted=access_token_encrypted,
                refresh_token_encrypted=refresh_token_encrypted,
                scopes=scopes,
                expires_at=expires_at,
            )
            self._session.add(new_conn)
            await self._session.flush()
            await self._session.refresh(new_conn)
            return new_conn

    async def revoke_active_connection(self, user_id: UUID) -> bool:
        """Revoga a conexão ativa do usuário (soft delete)."""
        existing = await self.get_active_by_user_id(user_id)
        if not existing:
            return False
            
        existing.revoked_at = datetime.now(timezone.utc)
        existing.updated_at = datetime.now(timezone.utc)
        self._session.add(existing)
        await self._session.flush()
        return True

    async def has_active_connection(self, user_id: UUID) -> bool:
        """Verifica se o usuário tem uma conexão ativa."""
        conn = await self.get_active_by_user_id(user_id)
        return conn is not None
