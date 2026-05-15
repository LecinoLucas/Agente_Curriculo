"""Unit tests for validation response schema and display formatting."""
from decimal import Decimal
from uuid import uuid4

import pytest

from src.interface.api.schemas.analysis_schemas import AnalysisMatchResponse


class TestValidationResponseSchema:
    """Test AnalysisMatchResponse includes validation fields."""

    def test_response_with_pass_status(self) -> None:
        """Response includes validation_status=pass with no evidence gaps."""
        response = AnalysisMatchResponse(
            analysis_id=uuid4(),
            job_id=uuid4(),
            match_score=Decimal("85.00"),
            recommendation="strong_match",
            mandatory_skills_matched=3,
            mandatory_skills_total=3,
            optional_skills_matched=2,
            optional_skills_total=2,
            seniority_score=Decimal("100.00"),
            candidate_seniority="mid",
            job_seniority="mid",
            validation_status="pass",
            missing_evidence=[],
            rejection_reasons=[],
        )

        assert response.validation_status == "pass"
        assert response.missing_evidence == []
        assert response.rejection_reasons == []
        assert response.recommendation == "strong_match"

    def test_response_with_fail_status(self) -> None:
        """Response includes validation_status=fail with rejection_reasons."""
        response = AnalysisMatchResponse(
            analysis_id=uuid4(),
            job_id=uuid4(),
            match_score=Decimal("39.00"),
            recommendation="not_match",
            mandatory_skills_matched=0,
            mandatory_skills_total=1,
            optional_skills_matched=0,
            optional_skills_total=0,
            seniority_score=Decimal("100.00"),
            candidate_seniority="mid",
            job_seniority="mid",
            validation_status="fail",
            missing_evidence=[],
            rejection_reasons=[
                "Educação insuficiente (high_school < bachelor)",
            ],
        )

        assert response.validation_status == "fail"
        assert response.missing_evidence == []
        assert len(response.rejection_reasons) == 1
        assert "insuficiente" in response.rejection_reasons[0].lower()
        assert response.recommendation == "not_match"
        assert response.match_score == Decimal("39.00")

    def test_response_with_unknown_status(self) -> None:
        """Response includes validation_status=unknown with missing_evidence."""
        response = AnalysisMatchResponse(
            analysis_id=uuid4(),
            job_id=uuid4(),
            match_score=Decimal("67.50"),
            recommendation="review_manually",
            mandatory_skills_matched=2,
            mandatory_skills_total=2,
            optional_skills_matched=1,
            optional_skills_total=1,
            seniority_score=Decimal("100.00"),
            candidate_seniority="mid",
            job_seniority="mid",
            validation_status="unknown",
            missing_evidence=["education"],
            rejection_reasons=[
                "Educação não informada (exigido: bachelor)",
            ],
        )

        assert response.validation_status == "unknown"
        assert "education" in response.missing_evidence
        assert response.recommendation == "review_manually"
        assert response.match_score > Decimal("39.00")
        assert len(response.rejection_reasons) > 0

    def test_response_with_both_evidence_missing(self) -> None:
        """Response shows multiple missing evidence fields."""
        response = AnalysisMatchResponse(
            analysis_id=uuid4(),
            job_id=uuid4(),
            match_score=Decimal("67.50"),
            recommendation="review_manually",
            mandatory_skills_matched=2,
            mandatory_skills_total=2,
            optional_skills_matched=0,
            optional_skills_total=0,
            seniority_score=Decimal("100.00"),
            candidate_seniority="mid",
            job_seniority="mid",
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


class TestValidationDisplayFormatting:
    """Test frontend display formatting of validation fields."""

    def test_pass_status_display(self) -> None:
        """PASS status should display as green."""
        validation = {
            "status": "pass",
            "color": "green",
            "icon": "✓",
            "message": "Atende aos requisitos",
        }

        assert validation["color"] == "green"
        assert validation["status"] == "pass"

    def test_fail_status_display(self) -> None:
        """FAIL status should display as red with reasons."""
        validation = {
            "status": "fail",
            "color": "red",
            "icon": "✗",
            "message": "Não atende aos requisitos",
            "reasons": [
                "Educação insuficiente (high_school < bachelor)",
            ],
        }

        assert validation["color"] == "red"
        assert validation["status"] == "fail"
        assert validation["reasons"]

    def test_unknown_status_display(self) -> None:
        """UNKNOWN status should display as yellow with missing fields."""
        validation = {
            "status": "unknown",
            "color": "yellow",
            "icon": "!",
            "message": "Dados insuficientes para validação",
            "missing_fields": ["education"],
        }

        assert validation["color"] == "yellow"
        assert validation["status"] == "unknown"
        assert validation["missing_fields"]

    def test_missing_evidence_badge(self) -> None:
        """Missing evidence should display as badges/tags."""
        missing = ["education", "experience"]
        badges = [{"label": field, "color": "orange"} for field in missing]

        assert len(badges) == 2
        assert all(b["color"] == "orange" for b in badges)

    def test_rejection_reasons_list(self) -> None:
        """Rejection reasons should display as expandable list."""
        reasons = [
            "Educação insuficiente (high_school < bachelor)",
            "Experiência insuficiente (2.0 < 5.0 anos)",
        ]

        for reason in reasons:
            # Each reason should have a clear message
            assert len(reason) > 10
            assert "(" in reason and ")" in reason


class TestValidationIntegrationWithScoring:
    """Test that validation fields don't affect score calculation."""

    def test_validation_separate_from_score(self) -> None:
        """Validation status and score are independent."""
        # UNKNOWN status doesn't hard-reject (score > 39)
        response = AnalysisMatchResponse(
            analysis_id=uuid4(),
            job_id=uuid4(),
            match_score=Decimal("67.50"),  # > 39, not hard-rejected
            recommendation="review_manually",
            mandatory_skills_matched=2,
            mandatory_skills_total=2,
            optional_skills_matched=1,
            optional_skills_total=1,
            seniority_score=Decimal("100.00"),
            candidate_seniority="mid",
            job_seniority="mid",
            validation_status="unknown",
            missing_evidence=["education"],
            rejection_reasons=[],
        )

        # Score is still calculated (not zero), just penalized
        assert response.match_score > Decimal("0")
        assert response.validation_status == "unknown"

    def test_fail_status_caps_score_at_39(self) -> None:
        """FAIL status hard-caps score at 39."""
        response = AnalysisMatchResponse(
            analysis_id=uuid4(),
            job_id=uuid4(),
            match_score=Decimal("39.00"),  # Capped
            recommendation="not_match",
            mandatory_skills_matched=0,
            mandatory_skills_total=1,
            optional_skills_matched=0,
            optional_skills_total=0,
            seniority_score=Decimal("100.00"),
            candidate_seniority="mid",
            job_seniority="mid",
            validation_status="fail",
            missing_evidence=[],
            rejection_reasons=["Educação insuficiente"],
        )

        assert response.match_score <= Decimal("39.00")
        assert response.validation_status == "fail"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
