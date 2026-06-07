from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.application.services.ai_usage_log_service import AIUsageLogPayload, AIUsageService


class _ScalarResult:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def all(self) -> list[object]:
        return self._rows


class _ExecuteResult:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def scalars(self) -> _ScalarResult:
        return _ScalarResult(self._rows)


class _FakeSession:
    def __init__(self, rows: list[object] | None = None) -> None:
        self.rows = rows or []
        self.added: list[object] = []
        self.flushed = False

    async def execute(self, *_args, **_kwargs) -> _ExecuteResult:
        return _ExecuteResult(self.rows)

    def add(self, row: object) -> None:
        self.added.append(row)

    async def flush(self) -> None:
        self.flushed = True


def _row(
    *,
    operation: str | None,
    input_tokens: int | None = 0,
    output_tokens: int | None = 0,
    total_tokens: int | None = 0,
    status: str = "success",
    created_at: datetime | None = None,
):
    return SimpleNamespace(
        operation=operation,
        provider="gemini",
        model="gemini-2.5-flash",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        status=status,
        created_at=created_at or datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_ai_usage_service_records_usage_with_tokens() -> None:
    session = _FakeSession()
    service = AIUsageService(session)  # type: ignore[arg-type]

    row = await service.record_usage(
        AIUsageLogPayload(
            provider="gemini",
            model="gemini-2.5-flash",
            operation="rag_synthesis",
            input_tokens=10,
            output_tokens=5,
            status="success",
        )
    )

    assert session.flushed is True
    assert session.added == [row]
    assert row.input_tokens == 10
    assert row.output_tokens == 5
    assert row.total_tokens == 15
    assert row.operation == "rag_synthesis"


@pytest.mark.asyncio
async def test_ai_usage_service_handles_missing_tokens_in_summary() -> None:
    service = AIUsageService(_FakeSession([_row(operation="rag_synthesis", input_tokens=None, output_tokens=None, total_tokens=None)]))  # type: ignore[arg-type]

    summary = await service.get_usage_summary()

    assert summary["totals"]["requests"] == 1
    assert summary["totals"]["input_tokens"] == 0
    assert summary["totals"]["output_tokens"] == 0
    assert summary["totals"]["total_tokens"] == 0


@pytest.mark.asyncio
async def test_ai_usage_summary_sums_and_groups_by_feature() -> None:
    rows = [
        _row(operation="rag_synthesis", input_tokens=100, output_tokens=20, total_tokens=120),
        _row(operation="rag_synthesis", input_tokens=50, output_tokens=10, total_tokens=60, status="error"),
        _row(operation="job_ai_draft", input_tokens=80, output_tokens=40, total_tokens=120),
    ]
    service = AIUsageService(_FakeSession(rows))  # type: ignore[arg-type]

    summary = await service.get_usage_summary()

    assert summary["totals"] == {
        "requests": 3,
        "input_tokens": 230,
        "output_tokens": 70,
        "total_tokens": 300,
        "errors": 1,
    }
    by_feature = {item["feature"]: item for item in summary["by_feature"]}
    assert by_feature["rag_synthesis"]["requests"] == 2
    assert by_feature["rag_synthesis"]["total_tokens"] == 180
    assert by_feature["rag_synthesis"]["errors"] == 1
    assert by_feature["job_ai_draft"]["requests"] == 1


@pytest.mark.asyncio
async def test_ai_usage_recent_limits_results() -> None:
    rows = [
        _row(operation="rag_synthesis", total_tokens=index, created_at=datetime(2026, 1, 1, 0, index, tzinfo=timezone.utc))
        for index in range(25)
    ]
    service = AIUsageService(_FakeSession(rows))  # type: ignore[arg-type]

    summary = await service.get_usage_summary()

    assert len(summary["recent"]) == 20
    assert summary["recent"][0]["total_tokens"] == 24


@pytest.mark.asyncio
async def test_ai_usage_summary_does_not_return_sensitive_metadata() -> None:
    service = AIUsageService(_FakeSession([_row(operation="rag_synthesis", total_tokens=1)]))  # type: ignore[arg-type]

    with patch("src.application.services.ai_usage_log_service.settings.GOOGLE_API_KEY_1", "AIza-secret"):
        summary = await service.get_usage_summary()

    serialized = str(summary)
    assert "AIza-secret" not in serialized
    assert "GEMINI_API_KEY" not in serialized
    assert "prompt" not in serialized.lower()
    assert "resposta completa" not in serialized.lower()
    assert "payload_json" not in serialized
    assert "vector_json" not in serialized
    assert "content_hash" not in serialized
    assert "embeddings" not in serialized
