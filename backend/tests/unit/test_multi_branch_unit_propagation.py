"""Unit tests for Phase 1 multi-branch/multi-unit propagation.

Criteria verified:
- ProtheusCasePayloadAdapter._resolve_unit_code prioritizes case.operational_unit_id
- Without operational_unit_id, fallback to job_units remains intact
- Without preferred_unit_id on application, pipeline operational_unit_id stays NULL
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import sqlalchemy as sa

from src.application.services.protheus_case_payload_adapter import ProtheusCasePayloadAdapter
from src.infrastructure.database.models.pre_admission_model import PreAdmissionCaseModel


# ── helpers ──────────────────────────────────────────────────────────────────


def _make_case(operational_unit_id=None):
    case = MagicMock(spec=PreAdmissionCaseModel)
    case.id = uuid4()
    case.candidate_id = uuid4()
    case.job_id = uuid4()
    case.operational_unit_id = operational_unit_id
    case.salary_offer = Decimal("3500.00")
    case.start_date = None
    return case


# ── _resolve_unit_code: direct unit lookup ────────────────────────────────────


@pytest.mark.asyncio
async def test_resolve_unit_code_uses_operational_unit_id_when_set():
    """When case.operational_unit_id is set and the unit is active, return its code."""
    unit_id = uuid4()
    session = AsyncMock()

    # First scalar call: direct lookup by operational_unit_id → returns a code
    # Second scalar call: job_units fallback (should NOT be reached)
    session.scalar = AsyncMock(return_value="UNIT-DIRECT")

    adapter = ProtheusCasePayloadAdapter(session)
    code = await adapter._resolve_unit_code(
        uuid4(),  # job_id (irrelevant when unit_id is set)
        None,
        operational_unit_id=unit_id,
    )

    assert code == "UNIT-DIRECT"
    # Only one scalar call should have happened (the direct lookup)
    assert session.scalar.call_count == 1


@pytest.mark.asyncio
async def test_resolve_unit_code_falls_back_to_job_units_when_unit_id_is_none():
    """When operational_unit_id is None, fall through to job_units lookup."""
    session = AsyncMock()
    session.scalar = AsyncMock(return_value="UNIT-FALLBACK")

    adapter = ProtheusCasePayloadAdapter(session)
    code = await adapter._resolve_unit_code(
        uuid4(),
        None,
        operational_unit_id=None,
    )

    assert code == "UNIT-FALLBACK"
    assert session.scalar.call_count == 1


@pytest.mark.asyncio
async def test_resolve_unit_code_falls_back_to_job_units_when_direct_unit_inactive():
    """When operational_unit_id's unit is inactive/missing, fall through to job_units."""
    session = AsyncMock()
    # First call: direct unit lookup → returns None (inactive/not found)
    # Second call: job_units fallback → returns a code
    session.scalar = AsyncMock(side_effect=[None, "UNIT-FROM-JOB"])

    adapter = ProtheusCasePayloadAdapter(session)
    code = await adapter._resolve_unit_code(
        uuid4(),
        None,
        operational_unit_id=uuid4(),
    )

    assert code == "UNIT-FROM-JOB"
    assert session.scalar.call_count == 2


@pytest.mark.asyncio
async def test_resolve_unit_code_uses_fallback_param_when_no_units():
    """When both direct and job_units return nothing, use the fallback_unit_code param."""
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)

    adapter = ProtheusCasePayloadAdapter(session)
    code = await adapter._resolve_unit_code(
        uuid4(),
        "STUB-FALLBACK",
        operational_unit_id=None,
    )

    assert code == "STUB-FALLBACK"


@pytest.mark.asyncio
async def test_resolve_unit_code_returns_none_when_no_unit_anywhere():
    """Returns None when there is no unit at all."""
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)

    adapter = ProtheusCasePayloadAdapter(session)
    code = await adapter._resolve_unit_code(
        uuid4(),
        None,
        operational_unit_id=None,
    )

    assert code is None


# ── _lookup_preferred_unit_id ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_lookup_preferred_unit_id_returns_none_when_no_application():
    """Returns None when there is no matching CandidateApplicationModel."""
    from src.application.services.pipeline_service import _lookup_preferred_unit_id

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)

    result = await _lookup_preferred_unit_id(
        session,
        candidate_id=uuid4(),
        job_id=uuid4(),
    )

    assert result is None


@pytest.mark.asyncio
async def test_lookup_preferred_unit_id_returns_unit_from_application():
    """Returns the preferred_unit_id from the candidate's application."""
    from src.application.services.pipeline_service import _lookup_preferred_unit_id

    expected_unit_id = uuid4()
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=expected_unit_id)

    result = await _lookup_preferred_unit_id(
        session,
        candidate_id=uuid4(),
        job_id=uuid4(),
    )

    assert result == expected_unit_id
