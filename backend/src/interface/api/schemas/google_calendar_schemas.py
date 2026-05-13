from datetime import datetime
from typing import Optional
from src.interface.api.schemas.common import APISchemaModel


class GoogleCalendarConnectionStatusResponse(APISchemaModel):
    """Schema para status da conexão com Google Calendar."""

    connected: bool
    google_account_email: Optional[str] = None
    connected_at: Optional[datetime] = None
