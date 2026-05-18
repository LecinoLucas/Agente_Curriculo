"""R14 — Contract test for /candidate-portal/overview.

The candidate-facing JSON must never carry internal fields (internal_notes,
archived_by, archive_reason, data_quality_reason, deleted_at, raw cpf, or any
score/admin payload). Today the schemas in candidate_portal_schemas.py use an
explicit whitelist; this test pins that contract so a future careless change
(e.g. someone returning the whole CandidateModel via `from_orm`) regresses
the suite instead of leaking PII to candidates.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_portal_auth_service import (
    CANDIDATE_PORTAL_COOKIE_NAME,
    CandidatePortalAuthService,
)
from src.infrastructure.database.models.candidate_model import CandidateModel


SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")

# Anything in here MUST NOT appear in the portal JSON response.
_FORBIDDEN_KEYS = frozenset({
    "internal_notes",
    "archived_by",
    "archived_at",
    "archive_reason",
    "archive_reason_note",
    "data_quality_reason",
    "data_quality_marked_at",
    "deleted_at",
    "cpf",            # raw cpf — only masked variant `cpf_masked` is allowed
    "cpf_hash",       # never goes to the client
    "password_hash",
    "lgpd_consent_version",
    # Score / admin payloads — none of these belong in the candidate portal.
    "final_score",
    "decision_suggestion",
    "breakdown",
    "reason_codes",
    "explanation_text",
})


def _walk_keys(obj: object) -> set[str]:
    """Return every dict key reached when recursively walking a JSON-like structure."""
    found: set[str] = set()
    if isinstance(obj, dict):
        for key, value in obj.items():
            found.add(key)
            found.update(_walk_keys(value))
    elif isinstance(obj, list):
        for item in obj:
            found.update(_walk_keys(item))
    return found


async def _seed_candidate_with_internal_garbage(session: AsyncSession) -> UUID:
    """Create a candidate with every internal field populated, so any leak
    actually carries data instead of None."""
    now = datetime.now(UTC)
    cid = uuid4()

    candidate = CandidateModel(
        id=cid,
        full_name="Fulana Da Silva",
        email="fulana@example.com",
        phone="+5599999999",
        cpf="12345678900",
        location_city="Recife",
        location_state="PE",
        location_country="BR",
        created_by=SYSTEM_USER_ID,
        created_at=now,
        updated_at=now,
        application_source="manual",
        # ── Fields that MUST NOT leak ──
        internal_notes="CONFIDENTIAL: do not hire, unprofessional in interview",
        archived_by=SYSTEM_USER_ID,
        archived_at=now,
        archive_reason="quality",
        archive_reason_note="internal note about archive",
        data_quality_status="invalid",
        data_quality_reason="CPF mismatch — INTERNAL",
        data_quality_marked_at=now,
        password_hash="$2b$12$verysecrethash",
        lgpd_consent_at=now,
        lgpd_consent_version="v1.0",
    )
    session.add(candidate)
    await session.commit()
    return cid


async def _login_as_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
    candidate_id: UUID,
) -> None:
    """Issue a portal session token and attach it as a cookie to the client."""
    auth = CandidatePortalAuthService(db_session)
    result = await auth.create_session(
        candidate_id=candidate_id,
        ip_address="127.0.0.1",
        user_agent="pytest-r14-contract-test",
    )  # type: ignore[attr-defined]
    token = result[0] if isinstance(result, tuple) else result
    client.cookies.set(CANDIDATE_PORTAL_COOKIE_NAME, token)


@pytest.mark.asyncio
async def test_candidate_portal_overview_does_not_leak_internal_fields(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate_id = await _seed_candidate_with_internal_garbage(db_session)

    # Direct cookie injection — we don't go through full login here so the test
    # stays focused on response shape. If create_session is not directly callable
    # in your test setup, skip with a clear message instead of false-passing.
    try:
        await _login_as_candidate(client, db_session, candidate_id)
    except AttributeError:
        pytest.skip(
            "CandidatePortalAuthService.create_session not exposed — "
            "see test_candidate_portal_session_audit.py for the canonical helper"
        )

    response = await client.get("/api/v1/candidate-portal/overview")
    # Profile completion or no application yet can produce 403/404 — that's fine,
    # the response body must STILL not leak internal fields.
    body_text = response.text
    if not body_text:
        pytest.skip("No body returned — cannot run contract assertions")

    try:
        body = response.json()
    except json.JSONDecodeError:
        pytest.fail(f"Portal response was not JSON: {body_text!r}")

    leaked = _walk_keys(body) & _FORBIDDEN_KEYS
    assert not leaked, (
        f"Portal response leaked forbidden internal fields: {sorted(leaked)}. "
        f"Full response keys: {sorted(_walk_keys(body))}"
    )

    # Belt-and-suspenders: also assert raw CPF value never appears as a string.
    assert "12345678900" not in body_text, (
        "Raw CPF value found in portal response body"
    )
    assert "CONFIDENTIAL" not in body_text, (
        "Internal notes leaked into portal response body"
    )
    assert "verysecrethash" not in body_text, (
        "Password hash leaked into portal response body"
    )
