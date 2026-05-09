"""Audit test to identify score inflation in F7.1.

Validates that:
1. PostgreSQL → SQL returns 0.85, not 1.0
2. PySpark → Spark doesn't inflate to 1.0
3. Exact matches only = 1.0 (Python → Python)
4. mandatory_score != strong_coverage (they measure different things)
"""

from decimal import Decimal
from types import SimpleNamespace

import pytest

from src.application.services.analysis_service import _compute_skill_scores


def _row(name: str, *, mandatory: bool = True):
    return SimpleNamespace(
        skill_name=name,
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=mandatory),
    )


class TestF71ScoreInflationAudit:
    """Identify and audit score inflation bugs."""

    def test_postgresql_sql_should_be_085_not_10(self):
        """PostgreSQL → SQL must be 0.85, not 1.0.

        This is a strong equivalence, not an exact match.
        mandatory_score should reflect the evidence quality.
        """
        job_skills = [_row("SQL", mandatory=True)]
        candidate_skills = {"postgresql"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Must NOT be 100 (exact match)
        assert result["mandatory_score_weighted"] != Decimal("100")

        # Should be around 85 (strong equivalence from catalog)
        assert Decimal("80") <= result["mandatory_score_weighted"] <= Decimal("90")

        # Mandatory matched should be 1 (score >= 0.8)
        assert result["mandatory_matched"] == 1

        print(f"\n[PostgreSQL → SQL]")
        print(f"  Score: {result['mandatory_score_weighted']}")
        print(f"  Strong Coverage: {result['mandatory_strong_coverage']}%")
        print(f"  Matched: {result['mandatory_matched']}")

    def test_mixed_exact_and_equivalence_scores(self):
        """Mix of exact and equivalence should not produce 100% score.

        Job requires: SQL, Python, Spark
        Candidate has: PostgreSQL (strong equiv), Python (exact), PySpark (strong equiv)

        Expected:
        - SQL: 0.85 (PostgreSQL strong)
        - Python: 1.0 (exact)
        - Spark: 0.85 (PySpark strong, if it's in catalog)

        Average = (0.85 + 1.0 + 0.85) / 3 * 100 = 90.0
        NOT 100.0
        """
        job_skills = [
            _row("SQL", mandatory=True),
            _row("Python", mandatory=True),
            _row("Spark", mandatory=True),
        ]
        candidate_skills = {"postgresql", "python", "pyspark"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Should be ~90, not 100
        assert result["mandatory_score_weighted"] < Decimal("100")
        assert result["mandatory_score_weighted"] >= Decimal("85")

        # All should be matched (score >= 0.8)
        assert result["mandatory_matched"] == 3

        # But strong_coverage can be 100% (all have >= 0.8)
        assert result["mandatory_strong_coverage"] == Decimal("100")

        print(f"\n[PostgreSQL/Python/PySpark → SQL/Python/Spark]")
        print(f"  Mandatory Score: {result['mandatory_score_weighted']}")
        print(f"  Strong Coverage: {result['mandatory_strong_coverage']}%")
        print(f"  Matched: {result['mandatory_matched']}/3")
        print(f"  Issue: Score={result['mandatory_score_weighted']}, Coverage={result['mandatory_strong_coverage']}")
        print(f"  These should differ: score measures evidence quality, coverage measures count")

    def test_exact_only_equals_100(self):
        """Only exact matches should produce 100% score."""
        job_skills = [
            _row("Python", mandatory=True),
            _row("Java", mandatory=True),
        ]
        candidate_skills = {"python", "java"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Both exact = 100%
        assert result["mandatory_score_weighted"] == Decimal("100")
        assert result["mandatory_strong_coverage"] == Decimal("100")
        assert result["mandatory_matched"] == 2

    def test_strong_coverage_vs_mandatory_score_distinction(self):
        """Demonstrate the difference between coverage and score.

        Coverage = % of skills with evidence (score >= 0.8)
        Score = average quality of evidence

        Example: 3 skills, 2 exact + 1 strong:
        - Coverage = 100% (all 3 >= 0.8)
        - Score = (1.0 + 1.0 + 0.85) / 3 * 100 = 95%
        """
        job_skills = [
            _row("Python", mandatory=True),      # Exact: 1.0
            _row("Java", mandatory=True),        # Exact: 1.0
            _row("SQL", mandatory=True),         # Strong: 0.85 (PostgreSQL)
        ]
        candidate_skills = {"python", "java", "postgresql"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        # Both metrics should be populated but different
        coverage = result["mandatory_strong_coverage"]
        score = result["mandatory_score_weighted"]

        print(f"\n[Distinction: Coverage vs Score]")
        print(f"  Coverage (% >= 0.8): {coverage}%")
        print(f"  Score (avg quality): {score}")
        print(f"  Matched: {result['mandatory_matched']}/3")

        # Coverage should be 100 (all 3 skills >= 0.8)
        assert coverage == Decimal("100")

        # Score should be ~95 (average of 1.0, 1.0, 0.85)
        assert score > Decimal("90") and score < Decimal("100")

    def test_partial_with_exact_mixed(self):
        """Partial + exact mix must not inflate.

        Job requires: SAP MM, SQL, Python
        Candidate has: Protheus (partial=0.45), PostgreSQL (strong=0.85), Python (exact=1.0)

        Average = (0.45 + 0.85 + 1.0) / 3 * 100 = 76.67
        Coverage = 2/3 * 100 = 66.67% (only 2 >= 0.8)
        """
        job_skills = [
            _row("SAP MM", mandatory=True),
            _row("SQL", mandatory=True),
            _row("Python", mandatory=True),
        ]
        candidate_skills = {"protheus", "postgresql", "python"}

        result = _compute_skill_scores(job_skills, candidate_skills)

        score = result["mandatory_score_weighted"]
        coverage = result["mandatory_strong_coverage"]

        print(f"\n[Partial + Strong + Exact]")
        print(f"  Score: {score}")
        print(f"  Coverage: {coverage}%")
        print(f"  Matched: {result['mandatory_matched']}")

        # Score should be ~75-80 (average includes 0.45)
        assert Decimal("70") < score < Decimal("85")

        # Coverage should be ~67% (only 2 skills >= 0.8)
        assert coverage <= Decimal("70")

        # Matched should be 2 (only >= 0.8)
        assert result["mandatory_matched"] == 2


class TestF71ScoreInflationRootCause:
    """Identify the root cause of inflated scores."""

    def test_skill_matches_exactness(self):
        """Audit _skill_matches to see if it's returning True for equivalence."""
        from src.application.services.analysis_service import _skill_matches

        result = _skill_matches("postgresql", "SQL")

        print(f"\n[Root Cause Check: _skill_matches]")
        print(f"  _skill_matches('postgresql', 'SQL') = {result}")

        if result:
            print("  ⚠️ PROBLEM: _skill_matches returned True for equivalence!")
            print("  This causes score=1.0 instead of going through SkillEquivalenceService")
        else:
            print("  ✓ OK: _skill_matches correctly returned False")
            print("  Will use SkillEquivalenceService for score 0.85")

    def test_equivalence_service_scores(self):
        """Verify SkillEquivalenceService returns correct scores."""
        from src.application.services.skill_equivalence_service import SkillEquivalenceService

        service = SkillEquivalenceService()

        cases = [
            ("postgresql", "SQL"),
            ("pyspark", "Spark"),
            ("python", "Python"),
            ("protheus", "SAP MM"),
        ]

        print(f"\n[SkillEquivalenceService Scores]")
        for candidate, required in cases:
            evidence = service.match_skill(candidate, required)
            print(f"  {candidate} → {required}:")
            print(f"    matched={evidence.matched}, strength={evidence.strength}, score={evidence.score}")

            if candidate == "python" and required == "Python":
                assert evidence.score == 1.0, "Exact match should be 1.0"
            elif candidate == "postgresql" and required == "SQL":
                assert 0.8 <= evidence.score < 1.0, "Strong equiv should be 0.8-0.9, not 1.0"
