from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

class CreateJobAreaRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)

class UpdateJobAreaRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    is_active: Optional[bool] = None

class JobAreaResponse(BaseModel):
    id: UUID
    name: str
    normalized_name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True
