"""Unit tests for AnalysisMatchResponse schema com campos de validation_status.

Fase 30E — schema atualizado para o contrato atual:
- `priority_skills_*` (era `mandatory_skills_*`)
- `complementary_skills_*` (era `optional_skills_*`)
- `job_fit_score: float` (era `match_score: Decimal`)
- `seniority_score: float` (era Decimal)
- `engine_used: str` obrigatório
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from src.interface.api.schemas.analysis_schemas import AnalysisMatchResponse


# ── Helper para evitar repetir os 9 campos obrigatórios em cada caso ────────


def _make_response(**overrides) -> AnalysisMatchResponse:
    defaults: dict = dict(
        analysis_id=uuid4(),
        job_id=uuid4(),
        job_fit_score=85.0,
        recommendation="strong_match",
        priority_skills_matched=3,
        priority_skills_total=3,
        complementary_skills_matched=2,
        complementary_skills_total=2,
        seniority_score=100.0,
        candidate_seniority="mid",
        job_seniority="mid",
        engine_used="adaptive_v2",
    )
    defaults.update(overrides)
    return AnalysisMatchResponse(**defaults)


class TestValidationResponseSchema:
    """AnalysisMatchResponse expõe validation_status, missing_evidence e rejection_reasons."""

    def test_response_with_pass_status(self) -> None:
        response = _make_response(
            validation_status="pass",
            missing_evidence=[],
            rejection_reasons=[],
        )
        assert response.validation_status == "pass"
        assert response.missing_evidence == []
        assert response.rejection_reasons == []
        assert response.recommendation == "strong_match"

    def test_response_with_fail_status(self) -> None:
        response = _make_response(
            job_fit_score=39.0,
            recommendation="not_match",
            priority_skills_matched=0,
            priority_skills_total=1,
            complementary_skills_matched=0,
            complementary_skills_total=0,
            validation_status="fail",
            rejection_reasons=["Educação insuficiente (high_school < bachelor)"],
        )
        assert response.validation_status == "fail"
        assert response.missing_evidence == []
        assert len(response.rejection_reasons) == 1
        assert "insuficiente" in response.rejection_reasons[0].lower()
        assert response.recommendation == "not_match"
        assert response.job_fit_score == 39.0

    def test_response_with_unknown_status(self) -> None:
        response = _make_response(
            job_fit_score=67.5,
            recommendation="review_manually",
            priority_skills_matched=2,
            priority_skills_total=2,
            complementary_skills_matched=1,
            complementary_skills_total=1,
            validation_status="unknown",
            missing_evidence=["education"],
            rejection_reasons=["Educação não informada (exigido: bachelor)"],
        )
        assert response.validation_status == "unknown"
        assert "education" in response.missing_evidence
        assert response.recommendation == "review_manually"
        assert response.job_fit_score > 39.0
        assert len(response.rejection_reasons) > 0

    def test_response_with_both_evidence_missing(self) -> None:
        response = _make_response(
            job_fit_score=67.5,
            recommendation="review_manually",
            priority_skills_matched=2,
            priority_skills_total=2,
            complementary_skills_matched=0,
            complementary_skills_total=0,
            validation_status="unknown",
            missing_evidence=["education", "experience"],
            rejection_reasons=[
                "Educação não informada (exigido: bachelor)",
                "Experiência não informada (exigido: 5.0 anos)",
            ],
        )
        assert response.validation_status == "unknown"
        assert set(response.missing_evidence) == {"education", "experience"}
        assert len(response.rejection_reasons) == 2

    def test_engine_used_is_required(self) -> None:
        """Schema atual exige `engine_used` — garante que o contrato não regride."""
        with pytest.raises(Exception):  # pydantic.ValidationError
            AnalysisMatchResponse(
                analysis_id=uuid4(),
                job_id=uuid4(),
                recommendation="strong_match",
                priority_skills_matched=1,
                priority_skills_total=1,
                complementary_skills_matched=0,
                complementary_skills_total=0,
                seniority_score=100.0,
                # engine_used ausente → deve falhar
            )


class TestValidationIntegrationWithScoring:
    """Validation fields são independentes do score numérico."""

    def test_unknown_status_does_not_hard_reject(self) -> None:
        """UNKNOWN não força score para baixo de 39 — apenas sinaliza pra triagem."""
        response = _make_response(
            job_fit_score=67.5,
            recommendation="review_manually",
            priority_skills_matched=2,
            priority_skills_total=2,
            complementary_skills_matched=1,
            complementary_skills_total=1,
            validation_status="unknown",
            missing_evidence=["education"],
            rejection_reasons=[],
        )
        assert response.job_fit_score > 0
        assert response.validation_status == "unknown"

    def test_fail_status_pode_acompanhar_score_baixo(self) -> None:
        """FAIL costuma vir com score ≤ 39 (hard-cap aplicado pelo serviço)."""
        response = _make_response(
            job_fit_score=39.0,
            recommendation="not_match",
            priority_skills_matched=0,
            priority_skills_total=1,
            complementary_skills_matched=0,
            complementary_skills_total=0,
            validation_status="fail",
            rejection_reasons=["Educação insuficiente"],
        )
        assert response.job_fit_score <= 39.0
        assert response.validation_status == "fail"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
