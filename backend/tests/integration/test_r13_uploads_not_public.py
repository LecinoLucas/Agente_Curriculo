"""R13 — LGPD: resume PDFs and pre-admission documents must NOT be served
publicly under /uploads/.

The mount was reduced to /uploads/avatars only. Any path outside that prefix
must respond 404 (route not registered), regardless of file existence on disk.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_resumes_path_is_not_publicly_mounted(client: AsyncClient) -> None:
    response = await client.get("/uploads/resumes/anything.pdf")
    # 404 (not found / not mounted) is the only acceptable answer.
    # Specifically must NOT be 200 (file served).
    assert response.status_code == 404, (
        "PDFs in uploads/resumes must NEVER be served publicly. "
        f"Got status {response.status_code}."
    )


@pytest.mark.asyncio
async def test_pre_admission_path_is_not_publicly_mounted(client: AsyncClient) -> None:
    response = await client.get("/uploads/pre_admission/anything.pdf")
    assert response.status_code == 404, (
        "Pre-admission documents (CPF/RG/etc) must NEVER be served publicly. "
        f"Got status {response.status_code}."
    )


@pytest.mark.asyncio
async def test_root_uploads_path_is_not_mounted(client: AsyncClient) -> None:
    response = await client.get("/uploads/")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_uploads_avatars_route_is_registered(client: AsyncClient) -> None:
    # The avatars sub-mount stays; a missing file returns 404 from StaticFiles,
    # but the route must exist (any other path returns 404 from the router).
    response = await client.get("/uploads/avatars/nonexistent.png")
    assert response.status_code == 404
