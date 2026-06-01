import re
import unicodedata
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)
from src.infrastructure.repositories.sqlalchemy_operational_master_repository import (
    SQLAlchemyOperationalMasterRepository,
)

LOCATION_GROUP_TYPES = {"city", "district", "corporate", "other"}
OPERATIONAL_UNIT_TYPES = {"office", "gas_station", "store", "other"}
UNSET = object()


def normalize_master_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = re.sub(r"\s+", " ", normalized)
    if not normalized:
        raise ValidationException("Nome obrigatório.")
    return normalized


def normalize_code(value: str) -> str:
    normalized = value.strip().upper()
    if not normalized:
        raise ValidationException("Código obrigatório.")
    return normalized


def normalize_state(value: str | None, *, required: bool) -> str | None:
    if value is None:
        if required:
            raise ValidationException("UF é obrigatória.")
        return None
    normalized = value.strip().upper()
    if required and not normalized:
        raise ValidationException("UF é obrigatória.")
    if normalized and len(normalized) != 2:
        raise ValidationException("UF deve ter 2 caracteres.")
    return normalized or None


class OperationalMasterService:
    def __init__(self, repository: SQLAlchemyOperationalMasterRepository):
        self._repository = repository

    async def list_groups(
        self,
        *,
        page: int,
        page_size: int,
        active: bool | None = None,
        search: str | None = None,
    ):
        return await self._repository.list_groups(
            page=page,
            page_size=page_size,
            active=active,
            search=search,
        )

    async def create_group(
        self,
        *,
        code: str,
        name: str,
        description: str | None = None,
        is_active: bool = True,
    ) -> OperationalGroupModel:
        normalized_code = normalize_code(code)
        normalized_name = normalize_master_name(name)
        await self._ensure_group_unique(code=normalized_code, normalized_name=normalized_name)

        return await self._repository.create_group(
            OperationalGroupModel(
                code=normalized_code,
                name=name.strip(),
                normalized_name=normalized_name,
                description=description,
                is_active=is_active,
            )
        )

    async def update_group(
        self,
        *,
        group_id: UUID,
        code: Any = UNSET,
        name: Any = UNSET,
        description: Any = UNSET,
        is_active: Any = UNSET,
    ) -> OperationalGroupModel:
        group = await self._repository.find_group_by_id(group_id)
        if group is None:
            raise NotFoundException("Grupo operacional não encontrado.")

        if code is not UNSET:
            if code is None:
                raise ValidationException("Código obrigatório.")
            group.code = normalize_code(code)
        if name is not UNSET:
            if name is None:
                raise ValidationException("Nome obrigatório.")
            group.name = name.strip()
            group.normalized_name = normalize_master_name(name)
        await self._ensure_group_unique(
            code=group.code,
            normalized_name=group.normalized_name,
            current_id=group.id,
        )

        if description is not UNSET:
            group.description = description
        if is_active is not UNSET:
            if is_active is None:
                raise ValidationException("Status ativo/inativo é obrigatório.")
            group.is_active = is_active
        group.updated_at = datetime.now(UTC)
        return await self._repository.update_group(group)

    async def _ensure_group_unique(
        self,
        *,
        code: str,
        normalized_name: str,
        current_id: UUID | None = None,
    ) -> None:
        existing_code = await self._repository.find_group_by_code(code)
        if existing_code is not None and existing_code.id != current_id:
            raise ConflictException("Já existe um grupo operacional com este código.")

        existing_name = await self._repository.find_group_by_normalized_name(normalized_name)
        if existing_name is not None and existing_name.id != current_id:
            raise ConflictException("Já existe um grupo operacional com este nome.")

    async def list_location_groups(
        self,
        *,
        page: int,
        page_size: int,
        active: bool | None = None,
        type: str | None = None,
        search: str | None = None,
    ):
        if type is not None and type not in LOCATION_GROUP_TYPES:
            raise ValidationException("Tipo de localidade inválido.")
        return await self._repository.list_location_groups(
            page=page,
            page_size=page_size,
            active=active,
            type=type,
            search=search,
        )

    async def create_location_group(
        self,
        *,
        name: str,
        state: str,
        city: str | None = None,
        type: str = "other",
        is_active: bool = True,
    ) -> LocationGroupModel:
        if type not in LOCATION_GROUP_TYPES:
            raise ValidationException("Tipo de localidade inválido.")

        normalized_name = normalize_master_name(name)
        normalized_state = normalize_state(state, required=True)
        await self._ensure_location_group_unique(
            normalized_name=normalized_name,
            state=normalized_state,
        )

        return await self._repository.create_location_group(
            LocationGroupModel(
                name=name.strip(),
                normalized_name=normalized_name,
                state=normalized_state,
                city=city.strip() if city else None,
                type=type,
                is_active=is_active,
            )
        )

    async def update_location_group(
        self,
        *,
        location_group_id: UUID,
        name: Any = UNSET,
        state: Any = UNSET,
        city: Any = UNSET,
        type: Any = UNSET,
        is_active: Any = UNSET,
    ) -> LocationGroupModel:
        location_group = await self._repository.find_location_group_by_id(location_group_id)
        if location_group is None:
            raise NotFoundException("Localidade não encontrada.")

        if name is not UNSET:
            if name is None:
                raise ValidationException("Nome obrigatório.")
            location_group.name = name.strip()
            location_group.normalized_name = normalize_master_name(name)
        if state is not UNSET:
            if state is None:
                raise ValidationException("UF é obrigatória.")
            location_group.state = normalize_state(state, required=True)
        if type is not UNSET:
            if type is None:
                raise ValidationException("Tipo de localidade é obrigatório.")
            if type not in LOCATION_GROUP_TYPES:
                raise ValidationException("Tipo de localidade inválido.")
            location_group.type = type

        await self._ensure_location_group_unique(
            normalized_name=location_group.normalized_name,
            state=location_group.state,
            current_id=location_group.id,
        )

        if city is not UNSET:
            location_group.city = city.strip() or None if city is not None else None
        if is_active is not UNSET:
            if is_active is None:
                raise ValidationException("Status ativo/inativo é obrigatório.")
            location_group.is_active = is_active
        location_group.updated_at = datetime.now(UTC)
        return await self._repository.update_location_group(location_group)

    async def _ensure_location_group_unique(
        self,
        *,
        normalized_name: str,
        state: str,
        current_id: UUID | None = None,
    ) -> None:
        existing = await self._repository.find_location_group_by_normalized_state(
            normalized_name,
            state,
        )
        if existing is not None and existing.id != current_id:
            raise ConflictException("Já existe uma localidade com este nome e UF.")

    async def list_units(
        self,
        *,
        page: int,
        page_size: int,
        active: bool | None = None,
        group_id: UUID | None = None,
        location_group_id: UUID | None = None,
        type: str | None = None,
        search: str | None = None,
    ):
        if type is not None and type not in OPERATIONAL_UNIT_TYPES:
            raise ValidationException("Tipo de unidade inválido.")
        return await self._repository.list_units(
            page=page,
            page_size=page_size,
            active=active,
            group_id=group_id,
            location_group_id=location_group_id,
            type=type,
            search=search,
        )

    async def create_unit(
        self,
        *,
        group_id: UUID,
        location_group_id: UUID,
        code: str,
        name: str,
        public_name: str | None = None,
        type: str = "other",
        reference_point: str | None = None,
        address: str | None = None,
        city: str | None = None,
        state: str | None = None,
        is_active: bool = True,
    ) -> OperationalUnitModel:
        if type not in OPERATIONAL_UNIT_TYPES:
            raise ValidationException("Tipo de unidade inválido.")

        await self._ensure_unit_parents_exist(
            group_id=group_id,
            location_group_id=location_group_id,
        )
        normalized_code = normalize_code(code)
        normalized_name = normalize_master_name(name)
        await self._ensure_unit_unique(group_id=group_id, code=normalized_code)

        return await self._repository.create_unit(
            OperationalUnitModel(
                group_id=group_id,
                location_group_id=location_group_id,
                code=normalized_code,
                name=name.strip(),
                normalized_name=normalized_name,
                public_name=public_name.strip() if public_name else None,
                type=type,
                reference_point=reference_point,
                address=address,
                city=city.strip() if city else None,
                state=normalize_state(state, required=False),
                is_active=is_active,
            )
        )

    async def update_unit(
        self,
        *,
        unit_id: UUID,
        group_id: Any = UNSET,
        location_group_id: Any = UNSET,
        code: Any = UNSET,
        name: Any = UNSET,
        public_name: Any = UNSET,
        type: Any = UNSET,
        reference_point: Any = UNSET,
        address: Any = UNSET,
        city: Any = UNSET,
        state: Any = UNSET,
        is_active: Any = UNSET,
    ) -> OperationalUnitModel:
        unit = await self._repository.find_unit_by_id(unit_id)
        if unit is None:
            raise NotFoundException("Unidade operacional não encontrada.")

        if group_id is not UNSET and group_id is None:
            raise ValidationException("Grupo operacional é obrigatório.")
        if location_group_id is not UNSET and location_group_id is None:
            raise ValidationException("Localidade é obrigatória.")

        next_group_id = group_id if group_id is not UNSET else unit.group_id
        next_location_group_id = (
            location_group_id
            if location_group_id is not UNSET
            else unit.location_group_id
        )
        if group_id is not UNSET or location_group_id is not UNSET:
            await self._ensure_unit_parents_exist(
                group_id=next_group_id,
                location_group_id=next_location_group_id,
            )
        if group_id is not UNSET:
            unit.group_id = group_id
        if location_group_id is not UNSET:
            unit.location_group_id = location_group_id
        if code is not UNSET:
            if code is None:
                raise ValidationException("Código obrigatório.")
            unit.code = normalize_code(code)
        if name is not UNSET:
            if name is None:
                raise ValidationException("Nome obrigatório.")
            unit.name = name.strip()
            unit.normalized_name = normalize_master_name(name)
        if type is not UNSET:
            if type is None:
                raise ValidationException("Tipo de unidade é obrigatório.")
            if type not in OPERATIONAL_UNIT_TYPES:
                raise ValidationException("Tipo de unidade inválido.")
            unit.type = type

        await self._ensure_unit_unique(group_id=unit.group_id, code=unit.code, current_id=unit.id)

        if public_name is not UNSET:
            unit.public_name = public_name.strip() or None if public_name is not None else None
        if reference_point is not UNSET:
            unit.reference_point = reference_point
        if address is not UNSET:
            unit.address = address
        if city is not UNSET:
            unit.city = city.strip() or None if city is not None else None
        if state is not UNSET:
            unit.state = normalize_state(state, required=False)
        if is_active is not UNSET:
            if is_active is None:
                raise ValidationException("Status ativo/inativo é obrigatório.")
            unit.is_active = is_active
        unit.updated_at = datetime.now(UTC)
        return await self._repository.update_unit(unit)

    async def _ensure_unit_parents_exist(self, *, group_id: UUID, location_group_id: UUID) -> None:
        if await self._repository.find_group_by_id(group_id) is None:
            raise NotFoundException("Grupo operacional não encontrado.")
        if await self._repository.find_location_group_by_id(location_group_id) is None:
            raise NotFoundException("Localidade não encontrada.")

    async def _ensure_unit_unique(
        self,
        *,
        group_id: UUID,
        code: str,
        current_id: UUID | None = None,
    ) -> None:
        existing = await self._repository.find_unit_by_group_code(group_id, code)
        if existing is not None and existing.id != current_id:
            raise ConflictException(
                "Já existe uma unidade operacional com este código neste grupo."
            )
