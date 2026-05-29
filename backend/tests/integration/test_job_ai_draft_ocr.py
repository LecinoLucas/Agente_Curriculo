"""Integration tests — POST /api/v1/jobs/ai-draft/ocr (Fase IA Vaga 2).

Tests validate the HTTP contract: auth, role enforcement, file validation,
and response structure.  OCR text content is NOT asserted (tesseract output
depends on installed language data and image content).
"""

from __future__ import annotations

import io

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user

OCR_URL = "/api/v1/jobs/ai-draft/ocr"


# ── Image helpers ─────────────────────────────────────────────────────────────

def _png(width: int = 120, height: int = 40) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg() -> bytes:
    img = Image.new("RGB", (120, 40), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── Auth & RBAC ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ocr_requires_authentication(client: AsyncClient) -> None:
    """Test 1: No auth token → 401."""
    files = {"file": ("test.png", io.BytesIO(_png()), "image/png")}
    response = await client.post(OCR_URL, files=files)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ocr_rejects_candidate_role(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test 2: CANDIDATE role → 403 (not staff)."""
    await _create_active_user(db_session, "ocr_cand@test.com", "pw123456", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "ocr_cand@test.com", "pw123456")
    files = {"file": ("test.png", io.BytesIO(_png()), "image/png")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 403


# ── Happy path ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ocr_valid_png_returns_200(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test 3: Valid PNG with RecruiterOrAdmin → 200 with expected response keys."""
    await _create_active_user(db_session, "ocr_recruiter@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_recruiter@test.com", "pw123456")

    files = {"file": ("vaga.png", io.BytesIO(_png()), "image/png")}
    response = await client.post(OCR_URL, files=files, headers=headers)

    assert response.status_code == 200
    body = response.json()

    assert "extracted_text" in body
    assert "text_preview" in body
    assert "character_count" in body
    assert "confidence" in body
    assert "source" in body

    src = body["source"]
    assert src["filename"] == "vaga.png"
    assert src["mime_type"] == "image/png"
    assert src["size_bytes"] > 0


@pytest.mark.asyncio
async def test_ocr_character_count_is_consistent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Test 3b: character_count matches len(extracted_text) and stays ≤ 12 000."""
    await _create_active_user(db_session, "ocr_recruiter2@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_recruiter2@test.com", "pw123456")

    files = {"file": ("vaga.png", io.BytesIO(_png()), "image/png")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 200

    body = response.json()
    assert body["character_count"] == len(body["extracted_text"])
    assert body["character_count"] <= 12_000


@pytest.mark.asyncio
async def test_ocr_admin_role_is_accepted(client: AsyncClient, db_session: AsyncSession) -> None:
    """Admin role should also be allowed."""
    await _create_active_user(db_session, "ocr_admin@test.com", "pw123456", UserRole.ADMIN)
    headers = await _auth_headers(client, "ocr_admin@test.com", "pw123456")

    files = {"file": ("vaga.png", io.BytesIO(_png()), "image/png")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 200


# ── File type validation ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ocr_rejects_pdf(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test 4: PDF MIME type → 422."""
    await _create_active_user(db_session, "ocr_type1@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_type1@test.com", "pw123456")

    fake_pdf = b"%PDF-1.4 fake"
    files = {"file": ("doc.pdf", io.BytesIO(fake_pdf), "application/pdf")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ocr_rejects_svg(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test 6a: SVG → 422."""
    await _create_active_user(db_session, "ocr_svg@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_svg@test.com", "pw123456")

    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>'
    files = {"file": ("icon.svg", io.BytesIO(svg), "image/svg+xml")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ocr_rejects_html(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test 6b: HTML MIME type → 422."""
    await _create_active_user(db_session, "ocr_html@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_html@test.com", "pw123456")

    html = b"<!DOCTYPE html><html><body>Vaga</body></html>"
    files = {"file": ("page.html", io.BytesIO(html), "text/html")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ocr_rejects_wrong_magic_bytes(client: AsyncClient, db_session: AsyncSession) -> None:
    """Sending random bytes with image/png MIME → 422 (magic byte mismatch)."""
    await _create_active_user(db_session, "ocr_magic@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_magic@test.com", "pw123456")

    fake = b"THISIS_NOT_A_PNG" + b"\x00" * 200
    files = {"file": ("fake.png", io.BytesIO(fake), "image/png")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 422


# ── Size validation ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ocr_rejects_oversized_file(client: AsyncClient, db_session: AsyncSession) -> None:
    """Test 5: File > 5 MB → 422."""
    await _create_active_user(db_session, "ocr_big@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_big@test.com", "pw123456")

    # Valid PNG magic header + bulk padding to exceed the 5 MB limit
    oversized = b"\x89PNG\r\n\x1a\n" + b"x" * (6 * 1024 * 1024)
    files = {"file": ("big.png", io.BytesIO(oversized), "image/png")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 422
    assert "grande" in response.json()["detail"].lower()


# ── Sanitisation ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ocr_sanitised_text_has_no_null_bytes(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Test 7: extracted_text must not contain null bytes or low control characters."""
    await _create_active_user(db_session, "ocr_sanitize@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_sanitize@test.com", "pw123456")

    files = {"file": ("vaga.png", io.BytesIO(_png()), "image/png")}
    response = await client.post(OCR_URL, files=files, headers=headers)
    assert response.status_code == 200

    extracted = response.json()["extracted_text"]
    assert "\x00" not in extracted
    assert "\x01" not in extracted
    assert "\x0b" not in extracted


# ── Rate limiting (Fase IA Vaga 5) ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_ocr_rate_limit_blocks_after_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """21st OCR request within 1 minute from same user → 429."""
    from src.core.settings import settings
    from src.interface.api.rate_limiting import reset_rate_limit_storage

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_AI_DRAFT_OCR", "20/minute")

    await _create_active_user(db_session, "ocr_rl1@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_rl1@test.com", "pw123456")

    statuses = []
    for _ in range(21):
        files = {"file": ("vaga.png", io.BytesIO(_png()), "image/png")}
        r = await client.post(OCR_URL, files=files, headers=headers)
        statuses.append(r.status_code)

    assert all(s != 429 for s in statuses[:20]), f"Unexpected 429 in first 20: {statuses}"
    assert statuses[20] == 429, f"Expected 429 on 21st attempt, got {statuses[20]}"
    assert "limite" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_ocr_rate_limit_disabled_does_not_block(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With RATE_LIMIT_ENABLED=False, many OCR calls never 429."""
    from src.core.settings import settings
    from src.interface.api.rate_limiting import reset_rate_limit_storage

    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)

    await _create_active_user(db_session, "ocr_rl3@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "ocr_rl3@test.com", "pw123456")

    for _ in range(5):
        files = {"file": ("vaga.png", io.BytesIO(_png()), "image/png")}
        r = await client.post(OCR_URL, files=files, headers=headers)
        assert r.status_code != 429, f"Should not 429 when disabled, got {r.status_code}"
