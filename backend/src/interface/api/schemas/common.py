from decimal import Decimal
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer

T = TypeVar("T")


class APISchemaModel(BaseModel):
    @field_serializer("*", when_used="json", check_fields=False)
    def _serialize_decimal(self, value: Any) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        return value


class ORMAPISchemaModel(APISchemaModel):
    model_config = ConfigDict(from_attributes=True)


class APIResponse(APISchemaModel, Generic[T]):
    data: T
    message: str = "success"


class PaginatedResponse(APISchemaModel, Generic[T]):
    data: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class ErrorDetail(APISchemaModel):
    code: str
    message: str
    field: str | None = None


class ErrorResponse(APISchemaModel):
    error: ErrorDetail
    request_id: UUID | None = None
