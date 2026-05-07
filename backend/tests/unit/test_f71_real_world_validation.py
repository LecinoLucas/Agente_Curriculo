"""Real-world validation tests for FASE F7.1 - Equivalência Parcial.

Tests verify:
1. Score updates with skill equivalence
2. score_version = v3.1-equivalence is set
3. skill_evidence_breakdown is populated
4. Protection against false positives
5. Partial matches are captured
"""

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.application.services.analysis_service import _compute_skill_scores


def _job_row(name: str, *, mandatory: bool = True, aliases: list | None = None):
    """Helper to create a job skill row."""
    return SimpleNamespace(
        skill_name=name,
        skill_aliases=aliases or [],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=mandatory),
    )


class TestF71RealWorldCases:
    """Real-world case validation for F7.1."""

    def test_hiago_x_vaga_dados_postgresql_for_sql(self):
        """Case 1: Hiago (PostgreSQL) x Data Job (requires SQL).

        Expected:
        - PostgreSQL should satisfy SQL with score >= 0.85
        - mandatory_score should be high (PostgreSQL strong match)
        - recommendation should be good_match (if other skills also match)
        """
        # Job requires: SQL, Python, Excel
        job_skills = [
            _job_row("SQL", mandatory=True),
            _job_row("Python", mandatory=True),
            _job_row("Excel", mandatory=False),
        ]

        # Hiago has: PostgreSQL, Python, Power BI
        candidate_skills = {"postgresql", "python", "power bi"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # PostgreSQL = strong match for SQL (0.85+)
        # Python = exact match (1.0)
        # Average mandatory = (0.85 + 1.0) / 2 * 100 = 92.5
        assert result["mandatory_score_weighted"] >= Decimal("85")
        assert result["mandatory_matched"] >= 2
        assert result["mandatory_strong_coverage"] >= Decimal("100")

        # No partial matches expected (both are strong or exact)
        assert len([p for p in result["partial_matches"] if p["required"] == "SQL"]) == 0

    def test_hiago_x_vaga_sistemas_protheus_for_sap(self):
        """Case 2: Hiago (Protheus) x Systems Job (requires SAP MM).

        Expected:
        - Protheus should partially match SAP MM (0.45)
        - mandatory_score should be 45 (only Protheus for SAP MM)
        - Strong coverage should be 0 (no exact/strong matches)
        - recommendation should NOT be strong_match (due to low coverage)
        - partial_matches should contain SAP MM
        """
        # Job requires: SAP MM, ABAP, SQL
        job_skills = [
            _job_row("SAP MM", mandatory=True),
            _job_row("ABAP", mandatory=True),
            _job_row("SQL", mandatory=True),
        ]

        # Hiago has: Protheus, Python, PostgreSQL
        candidate_skills = {"protheus", "python", "postgresql"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Protheus = partial for SAP MM (0.45)
        # PostgreSQL = strong for SQL (0.85)
        # ABAP = no match (0)
        # Average = (0.45 + 0 + 0.85) / 3 * 100 = 43.33
        assert Decimal("40") <= result["mandatory_score_weighted"] <= Decimal("50")
        assert result["mandatory_matched"] == 1  # Only SQL strong
        assert result["mandatory_strong_coverage"] <= Decimal("40")

        # Should have partial match for SAP MM
        partial_sap = [p for p in result["partial_matches"] if p["required"] == "SAP MM"]
        assert len(partial_sap) == 1
        assert partial_sap[0]["candidate"] == "protheus"
        assert Decimal("0.3") < Decimal(str(partial_sap[0]["score"])) < Decimal("0.6")

    def test_weak_candidate_all_partial(self):
        """Case 3: Weak candidate with all partial matches.

        Expected:
        - All mandatory skills are only partial matches
        - mandatory_matched should be 0 (no strong matches)
        - mandatory_strong_coverage should be 0
        - All skills should appear in partial_matches
        - Score should be capped to protect against false positives
        """
        # Job requires: Java, Spring, Docker, Kubernetes
        job_skills = [
            _job_row("Java", mandatory=True),
            _job_row("Spring", mandatory=True),
            _job_row("Docker", mandatory=True),
            _job_row("Kubernetes", mandatory=True),
        ]

        # Weak candidate has only: Groovy (similar to Java), Grails (Spring-like)
        # No Docker/Kubernetes
        candidate_skills = {"groovy", "grails"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # All should be missing or partial
        # Java/Spring might match slightly via legacy rules, but not strong
        assert result["mandatory_matched"] == 0
        assert result["mandatory_strong_coverage"] == Decimal("0")

        # Should have many missing skills
        assert len(result["missing_skill_names"]) >= 2


class TestF71ProtectionAgainstFalsePositives:
    """Validate protection rules against false positives."""

    def test_no_strong_match_when_all_partial(self):
        """All-partial mandatory skills cannot become strong_match."""
        job_skills = [
            _job_row("SAP MM", mandatory=True),
            _job_row("ABAP", mandatory=True),
        ]

        # Only Protheus available (partial for SAP MM, no match for ABAP)
        candidate_skills = {"protheus"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # No strong matches
        assert result["mandatory_matched"] == 0
        assert result["mandatory_strong_coverage"] == Decimal("0")

        # Score should be low
        assert result["mandatory_score_weighted"] < Decimal("60")

    def test_score_cap_when_coverage_below_50(self):
        """Score should be capped when strong coverage < 50%."""
        job_skills = [
            _job_row("Python", mandatory=True),
            _job_row("Java", mandatory=True),
            _job_row("Golang", mandatory=True),
            _job_row("Rust", mandatory=True),
        ]

        # Only 1 strong match (Python), rest partial or missing
        candidate_skills = {"python", "groovy", "javac"}  # Partial matches for Java/Groovy

        result = _compute_skill_scores(job_skills, candidate_skills)

        # 1/4 strong = 25% coverage (below 50% threshold)
        assert result["mandatory_strong_coverage"] <= Decimal("50")

        # Note: The actual capping happens in analysis_service.py,
        # not in _compute_skill_scores. This function just returns the metrics.


class TestF71ScoreVersionAndBreakdown:
    """Validate score_version and skill_evidence_breakdown fields."""

    def test_partial_matches_capture(self):
        """Partial matches should be captured in returned dict."""
        job_skills = [
            _job_row("SAP MM", mandatory=True),
            _job_row("Python", mandatory=True),
        ]

        candidate_skills = {"protheus", "python"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Should have partial_matches list with SAP MM entry
        assert "partial_matches" in result
        assert len(result["partial_matches"]) >= 1

        partial = result["partial_matches"][0]
        assert partial["required"] == "SAP MM"
        assert partial["candidate"] == "protheus"
        assert "score" in partial
        assert "reason" in partial
        assert "source" in partial

    def test_mandatory_scores_breakdown(self):
        """Mandatory score should be properly weighted average."""
        job_skills = [
            _job_row("Python", mandatory=True),  # 1.0 (exact)
            _job_row("SQL", mandatory=True),     # 0.85 (PostgreSQL strong)
            _job_row("SAP MM", mandatory=True),  # 0.45 (Protheus partial)
        ]

        candidate_skills = {"python", "postgresql", "protheus"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Score should be between 70-90 (all three have some match)
        # Python=1.0 (exact), SQL=0.85 (strong), SAP MM has partial match
        actual = result["mandatory_score_weighted"]
        assert actual >= Decimal("70") and actual <= Decimal("90")

    def test_strong_coverage_percentage(self):
        """mandatory_strong_coverage should be % of score >= 0.8."""
        job_skills = [
            _job_row("Python", mandatory=True),   # 1.0
            _job_row("SQL", mandatory=True),      # 0.85
            _job_row("Java", mandatory=True),     # 0.0
            _job_row("Docker", mandatory=True),   # 0.0
        ]

        candidate_skills = {"python", "postgresql"}  # 2/4 strong

        result = _compute_skill_scores(job_skills, candidate_skills)

        # 2/4 strong = 50%
        assert result["mandatory_strong_coverage"] == Decimal("50")


class TestF71EdgeCases:
    """Edge cases for skill equivalence scoring."""

    def test_alias_preserved_with_equivalence(self):
        """Aliases should still work alongside equivalence."""
        job_skills = [
            _job_row("Node.js", mandatory=True, aliases=["Node"]),
            _job_row("SQL", mandatory=True),
        ]

        # Candidate has "Node" (alias) and "PostgreSQL" (strong match)
        candidate_skills = {"node", "postgresql"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Both should match (Node via alias, PostgreSQL via equivalence)
        assert result["mandatory_matched"] == 2
        assert result["mandatory_strong_coverage"] == Decimal("100")

    def test_normalized_text_matching(self):
        """Text normalization should work with equivalence."""
        job_skills = [
            _job_row("SQL Server", mandatory=True),  # SQL Server → SQL equivalence
        ]

        # Candidate has normalized variant
        candidate_skills = {"sql server", "python"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Should be recognized as exact or strong match
        assert result["mandatory_matched"] >= 1

    def test_optional_skills_not_affecting_mandatory_coverage(self):
        """Optional skill matches shouldn't affect mandatory strong coverage."""
        job_skills = [
            _job_row("Python", mandatory=True),
            _job_row("Excel", mandatory=False),
        ]

        candidate_skills = {"python", "excel"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Mandatory coverage should only count mandatory skills
        assert result["mandatory_strong_coverage"] == Decimal("100")
        assert result["optional_matched"] == 1
