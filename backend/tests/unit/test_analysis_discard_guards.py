"""Unit tests for AnalysisService.discard guard conditions.

These tests verify that the ValidationException guards in discard() are
correctly raised (not NameError) when the analysis is already discarded
or is in a processing state — covering B-CRIT-01/02 from AUDIT-FAIL-PERF-1.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.application.services.analysis_service import AnalysisService
from src.domain.exceptions import ValidationException


def _make_analysis(status: str) -> MagicMock:
    m = MagicMock()
    m.id = uuid4()
    m.status = status
    return m


def _make_service() -> AnalysisService:
    repo = MagicMock()
    repo._session = AsyncMock()
    service = AnalysisService(repository=repo)
    return service


def _make_user() -> SimpleNamespace:
    from src.domain.entities.user import UserRole
    return SimpleNamespace(id=uuid4(), role=UserRole.ADMIN)


class TestDiscardGuards:
    @pytest.mark.asyncio
    async def test_discard_already_discarded_raises_validation_exception(self):
        service = _make_service()
        analysis = _make_analysis("discarded")
        service.get = AsyncMock(return_value=analysis)  # type: ignore[method-assign]

        with pytest.raises(ValidationException, match="já está descartada"):
            await service.discard(
                analysis.id,
                current_user=_make_user(),
                reason="test",
            )

    @pytest.mark.asyncio
    async def test_discard_processing_raises_validation_exception(self):
        service = _make_service()
        analysis = _make_analysis("processing")
        service.get = AsyncMock(return_value=analysis)  # type: ignore[method-assign]

        with pytest.raises(ValidationException, match="em processamento"):
            await service.discard(
                analysis.id,
                current_user=_make_user(),
                reason="test",
            )

    @pytest.mark.asyncio
    async def test_discard_retry_scheduled_raises_validation_exception(self):
        service = _make_service()
        analysis = _make_analysis("retry_scheduled")
        service.get = AsyncMock(return_value=analysis)  # type: ignore[method-assign]

        with pytest.raises(ValidationException, match="em processamento"):
            await service.discard(
                analysis.id,
                current_user=_make_user(),
                reason="test",
            )
