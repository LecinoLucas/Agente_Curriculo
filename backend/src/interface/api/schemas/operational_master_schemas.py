from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from src.interface.api.schemas.common import ORMAPISchemaModel

LocationGroupType = Literal["city", "district", "corporate", "other"]
OperationalUnitType = Literal["office", "gas_station", "store", "other"]


class CreateOperationalGroupRequest(ORMAPISchemaModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool = True


class UpdateOperationalGroupRequest(ORMAPISchemaModel):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class OperationalGroupResponse(ORMAPISchemaModel):
    id: UUID
    code: str
    name: str
    normalized_name: str
    description: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CreateLocationGroupRequest(ORMAPISchemaModel):
    name: str = Field(..., min_length=1, max_length=255)
    state: str = Field(..., min_length=2, max_length=2)
    city: str | None = Field(default=None, max_length=255)
    type: LocationGroupType = "other"
    is_active: bool = True


class UpdateLocationGroupRequest(ORMAPISchemaModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    state: str | None = Field(default=None, min_length=2, max_length=2)
    city: str | None = Field(default=None, max_length=255)
    type: LocationGroupType | None = None
    is_active: bool | None = None


class LocationGroupResponse(ORMAPISchemaModel):
    id: UUID
    name: str
    normalized_name: str
    state: str
    city: str | None = None
    type: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CreateOperationalUnitRequest(ORMAPISchemaModel):
    group_id: UUID
    location_group_id: UUID
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    public_name: str | None = Field(default=None, max_length=255)
    type: OperationalUnitType = "other"
    reference_point: str | None = Field(default=None, max_length=1000)
    address: str | None = Field(default=None, max_length=1000)
    city: str | None = Field(default=None, max_length=255)
    state: str | None = Field(default=None, min_length=2, max_length=2)
    is_active: bool = True


class UpdateOperationalUnitRequest(ORMAPISchemaModel):
    group_id: UUID | None = None
    location_group_id: UUID | None = None
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    public_name: str | None = Field(default=None, max_length=255)
    type: OperationalUnitType | None = None
    reference_point: str | None = Field(default=None, max_length=1000)
    address: str | None = Field(default=None, max_length=1000)
    city: str | None = Field(default=None, max_length=255)
    state: str | None = Field(default=None, min_length=2, max_length=2)
    is_active: bool | None = None


class OperationalUnitResponse(ORMAPISchemaModel):
    id: UUID
    group_id: UUID
    location_group_id: UUID
    code: str
    name: str
    normalized_name: str
    public_name: str | None = None
    type: str
    reference_point: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
