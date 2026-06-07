"""Integration tests — POST /api/v1/jobs/ai-draft/from-image.

The OCR/image extraction service and AI provider are always mocked here.
No real OCR engine or external AI call is executed during the tests.
"""

from __future__ import annotations

import io
import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.application.ports.ai_service import AIAnalysisResponse
from src.application.services.job_image_text_extraction_service import (
    JobImageExtractionNoTextError,
    JobImageTextExtractionResult,
)
from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user

FROM_IMAGE_URL = "/api/v1/jobs/ai-draft/from-image"
_AI_PATCH_TARGET = "src.application.services.job_ai_draft_service.AIServiceFactory.create"
_EXTRACTION_PATCH_TARGET = (
    "src.application.services.job_image_text_extraction_service.JobImageTextExtractionService.extract_from_image"
)


def _mock_ai_response(draft: dict) -> AIAnalysisResponse:
    return AIAnalysisResponse(
        content=json.dumps(draft),
        input_tokens=180,
        output_tokens=90,
        cache_read_tokens=0,
        cache_write_tokens=0,
        processing_time_ms=320,
    )


def _mock_ai_service(draft: dict) -> AsyncMock:
    svc = AsyncMock()
    svc.analyze = AsyncMock(return_value=_mock_ai_response(draft))
    return svc


@pytest.fixture(autouse=True)
def _disable_langgraph(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "JOB_AI_DRAFT_USE_LANGGRAPH", False)


@pytest.mark.asyncio
async def test_from_image_requires_authentication(client: AsyncClient) -> None:
    files = {"file": ("vaga.jpg", io.BytesIO(b"fake"), "image/jpeg")}
    response = await client.post(FROM_IMAGE_URL, files=files)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_from_image_calls_extraction_and_returns_draft(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_active_user(db_session, "imgdraft_r1@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "imgdraft_r1@test.com", "pw123456")

    extraction = JobImageTextExtractionResult(
        extracted_text=(
            "OPERADOR DE CAIXA\nSalario R$ 1.800,00\nBeneficios: Vale-transporte\n"
            "Escala 6x1\nDiferencial: Protheus"
        ),
        confidence=None,
        warnings=["image_text_extraction_requires_review"],
    )
    ai_draft = {
        "title": "Operador de Caixa",
        "area": "Atendimento",
        "seniority": "junior",
        "work_model": "onsite",
        "unit": "Belem, PA",
        "salary_min": 1800.0,
        "salary_max": 1800.0,
        "minimum_education_level": None,
        "minimum_years_experience": None,
        "experience_context": None,
        "description": "Vaga para operacao de caixa.",
        "responsibilities": ["Atender clientes", "Operar caixa"],
        "requirements": ["Ensino medio completo"],
        "mandatory_skills": ["Atendimento ao cliente"],
        "nice_to_have_skills": ["Experiência com Protheus"],
        "benefits": ["Vale-transporte"],
        "working_hours": "6x1",
        "screening_questions": [],
        "pipeline_steps": ["Triagem"],
        "matching_criteria": ["Atendimento"],
        "selection_flow_type": None,
        "requires_manager_review": False,
        "requires_behavioral_assessment": False,
    }

    with (
        patch(_EXTRACTION_PATCH_TARGET, return_value=extraction) as extract_mock,
        patch(_AI_PATCH_TARGET, return_value=_mock_ai_service(ai_draft)),
    ):
        files = {"file": ("vaga.jpg", io.BytesIO(b"fake-image"), "image/jpeg")}
        response = await client.post(
            FROM_IMAGE_URL,
            files=files,
            data={"context_text": "Manter os dados exatamente como estiverem na arte."},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert extract_mock.called
    assert body["draft"]["title"] == "Operador de Caixa"
    assert body["draft"]["salary_min"] == 1800.0
    assert body["draft"]["benefits"] == ["Vale-transporte"]
    assert body["extracted_text"].startswith("OPERADOR DE CAIXA")
    assert "image_text_extraction_requires_review" in body["warnings"]
    assert "extracted_text" in body["needs_review"]


@pytest.mark.asyncio
async def test_from_image_preserves_differential_in_optional_skills(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_active_user(db_session, "imgdraft_r2@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "imgdraft_r2@test.com", "pw123456")

    extraction = JobImageTextExtractionResult(
        extracted_text="Diferencial: conhecimento em Protheus. Ensino medio completo.",
        confidence=None,
        warnings=[],
    )
    ai_draft = {
        "title": "Assistente Administrativo",
        "area": "Administrativo",
        "seniority": "junior",
        "work_model": "onsite",
        "unit": "Belem, PA",
        "salary_min": None,
        "salary_max": None,
        "minimum_education_level": None,
        "minimum_years_experience": None,
        "experience_context": None,
        "description": "Atuacao em rotinas administrativas.",
        "responsibilities": ["Atender area administrativa"],
        "requirements": ["Ensino medio completo"],
        "mandatory_skills": ["Experiência com Protheus"],
        "nice_to_have_skills": [],
        "benefits": [],
        "working_hours": None,
        "screening_questions": [],
        "pipeline_steps": ["Triagem"],
        "matching_criteria": ["Rotinas administrativas"],
        "selection_flow_type": None,
        "requires_manager_review": False,
        "requires_behavioral_assessment": False,
    }

    with (
        patch(_EXTRACTION_PATCH_TARGET, return_value=extraction),
        patch(_AI_PATCH_TARGET, return_value=_mock_ai_service(ai_draft)),
    ):
        files = {"file": ("vaga.jpg", io.BytesIO(b"fake-image"), "image/jpeg")}
        response = await client.post(FROM_IMAGE_URL, files=files, headers=headers)

    assert response.status_code == 200
    draft = response.json()["draft"]
    assert "Experiência com Protheus" not in draft["mandatory_skills"]
    assert "Experiência com Protheus" in draft["nice_to_have_skills"]
    assert "nice_to_have_preserved_from_source" in response.json()["warnings"]


@pytest.mark.asyncio
async def test_from_image_returns_controlled_error_when_no_useful_text(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_active_user(db_session, "imgdraft_r3@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "imgdraft_r3@test.com", "pw123456")

    with patch(
        _EXTRACTION_PATCH_TARGET,
        side_effect=JobImageExtractionNoTextError(
            "Nao foi possivel extrair texto util da imagem enviada."
        ),
    ):
        files = {"file": ("vaga.jpg", io.BytesIO(b"fake-image"), "image/jpeg")}
        response = await client.post(FROM_IMAGE_URL, files=files, headers=headers)

    assert response.status_code == 422
    assert "extrair texto util" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_from_image_rejects_invalid_file_type(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_active_user(db_session, "imgdraft_r4@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "imgdraft_r4@test.com", "pw123456")

    files = {"file": ("vaga.svg", io.BytesIO(b"<svg></svg>"), "image/svg+xml")}
    response = await client.post(FROM_IMAGE_URL, files=files, headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_from_image_rejects_oversized_file(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_active_user(db_session, "imgdraft_r5@test.com", "pw123456", UserRole.RECRUITER)
    headers = await _auth_headers(client, "imgdraft_r5@test.com", "pw123456")

    oversized = b"\x89PNG\r\n\x1a\n" + b"x" * (6 * 1024 * 1024)
    files = {"file": ("vaga.png", io.BytesIO(oversized), "image/png")}
    response = await client.post(FROM_IMAGE_URL, files=files, headers=headers)
    assert response.status_code == 422
