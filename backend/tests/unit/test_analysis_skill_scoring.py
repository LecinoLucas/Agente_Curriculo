"""Unit tests for analysis service skill scoring with equivalence."""

from decimal import Decimal
from types import SimpleNamespace

import pytest

from src.application.services.analysis_service import _compute_skill_scores


def _row(name: str, *, mandatory: bool = True, aliases: list | None = None):
    """Helper to create a job skill row."""
    return SimpleNamespace(
        skill_name=name,
        skill_aliases=aliases or [],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=mandatory),
    )


class TestAnalysisSkillScoring:
    """Tests for skill scoring in analysis_service with equivalence."""

    def test_postgresql_satisfies_sql_with_strong_score(self):
        """Test 1: PostgreSQL satisfies SQL requirement in real score."""
        result = _compute_skill_scores(
            [_row("SQL")],
            {"postgresql"}
        )
        # PostgreSQL should be strong match for SQL
        assert result["mandatory_score_weighted"] >= Decimal("85")
        assert result["mandatory_matched"] >= 1
        assert "SQL" in result["matched_skill_names"]

    def test_typescript_satisfies_javascript_mandatory_skill(self):
        """TypeScript must count as a strong match for mandatory JavaScript."""
        result = _compute_skill_scores(
            [_row("JavaScript"), _row("Node.js")],
            {"typescript", "node.js"},
        )
        assert result["mandatory_matched"] == 2
        assert result["mandatory_score_weighted"] >= Decimal("90")
        assert "JavaScript" in result["matched_skill_names"]
        assert "Node.js" in result["matched_skill_names"]

    def test_react_satisfies_javascript_mandatory_skill(self):
        """React must count as JavaScript ecosystem evidence."""
        result = _compute_skill_scores(
            [_row("JavaScript"), _row("Node.js")],
            {"react", "node.js"},
        )
        assert result["mandatory_matched"] == 2
        assert result["mandatory_score_weighted"] >= Decimal("90")
        assert "JavaScript" in result["matched_skill_names"]
        assert "Node.js" in result["matched_skill_names"]

    def test_protheus_partial_match_sap_mm_real_score(self):
        """Test 2: Protheus partially matches SAP MM in real score."""
        result = _compute_skill_scores(
            [_row("SAP MM")],
            {"protheus"}
        )
        # Protheus partial for SAP MM should result in intermediate score
        assert Decimal("30") < result["mandatory_score_weighted"] < Decimal("80")
        assert result["mandatory_matched"] == 0  # Not a strong match
        assert len(result["partial_matches"]) == 1
        assert result["partial_matches"][0]["required"] == "SAP MM"

    def test_all_partial_prevents_strong_match(self):
        """Test 3: All mandatory skills partial → cannot become strong_match."""
        result = _compute_skill_scores(
            [_row("SAP MM"), _row("COBOL")],
            {"protheus"}  # Protheus partial for SAP MM, no match for COBOL
        )
        # All mandatory are partial or missing
        assert result["mandatory_matched"] == 0  # No strong matches
        assert result["mandatory_strong_coverage"] == Decimal("0")
        # Score should be weighted but not sufficient for strong/good match
        assert result["mandatory_score_weighted"] < Decimal("60")

    def test_hiago_like_profile_real_scoring(self):
        """Test 4: Hiago-like profile with mixed exact and partial matches."""
        result = _compute_skill_scores(
            [
                _row("SQL", mandatory=True),
                _row("Power BI", mandatory=True),
                _row("SAP MM", mandatory=True),
                _row("Excel", mandatory=False),
            ],
            {"sql", "power bi", "python", "protheus"}
        )
        # SQL and Power BI = exact (score 1.0)
        # SAP MM = partial via Protheus (score ~0.45)
        # Excel optional = no match

        # At least 2 strong matches (SQL, Power BI)
        assert result["mandatory_matched"] >= 2
        # Strong coverage should be >= 60% (2/3 skills)
        assert result["mandatory_strong_coverage"] >= Decimal("60")
        # Weighted score should be between 60-90 (not capped)
        assert Decimal("60") <= result["mandatory_score_weighted"] <= Decimal("90")

        # Should have partial match for SAP MM
        assert len(result["partial_matches"]) >= 1
        assert any(pm["required"] == "SAP MM" for pm in result["partial_matches"])


class TestAnalysisSkillScoringEdgeCases:
    """Edge case tests for skill scoring."""

    def test_exact_match_returns_100_score(self):
        """Exact match should contribute 100 to weighted score."""
        result = _compute_skill_scores(
            [_row("Python")],
            {"python"}
        )
        assert result["mandatory_matched"] == 1
        assert result["mandatory_score_weighted"] == Decimal("100")

    def test_no_match_returns_0_score(self):
        """No match should contribute 0 to weighted score."""
        result = _compute_skill_scores(
            [_row("Fortran")],
            {"java"}
        )
        assert result["mandatory_matched"] == 0
        assert result["mandatory_score_weighted"] == Decimal("0")
        assert len(result["partial_matches"]) == 0
        assert "Fortran" in result["missing_skill_names"]

    def test_mixed_exact_and_partial(self):
        """Mix of exact and partial matches scores appropriately."""
        result = _compute_skill_scores(
            [_row("Python"), _row("SAP MM")],
            {"python", "protheus"}
        )
        # Python = exact (1.0), SAP MM = partial; catalog score may vary inside the
        # allowed partial band.
        assert Decimal("70") <= result["mandatory_score_weighted"] <= Decimal("80")
        assert result["mandatory_matched"] == 1  # Only Python is strong
        assert len(result["partial_matches"]) == 1

    def test_optional_skills_not_affecting_mandatory_coverage(self):
        """Optional skill matches shouldn't affect mandatory strong coverage."""
        result = _compute_skill_scores(
            [_row("Python", mandatory=True), _row("Excel", mandatory=False)],
            {"protheus", "excel"}  # No match for Python, exact for Excel
        )
        # Mandatory: Python = no match (0)
        assert result["mandatory_matched"] == 0
        # Optional: Excel = exact (1)
        assert result["optional_matched"] == 1
        # Strong coverage only counts mandatory
        assert result["mandatory_strong_coverage"] == Decimal("0")

    def test_empty_candidate_skills(self):
        """Empty candidate skills should result in no matches."""
        result = _compute_skill_scores(
            [_row("Python"), _row("SQL")],
            set()
        )
        assert result["mandatory_matched"] == 0
        assert result["mandatory_score_weighted"] == Decimal("0")
        assert result["missing_skill_names"] == ["Python", "SQL"]

    def test_empty_job_skills(self):
        """Empty job skills should not crash."""
        result = _compute_skill_scores(
            [],
            {"python", "sql"}
        )
        assert result["mandatory_matched"] == 0
        assert result["mandatory_score_weighted"] == Decimal("0")
        assert result["mandatory_strong_coverage"] == Decimal("100")  # 0/0 defaults to 100
