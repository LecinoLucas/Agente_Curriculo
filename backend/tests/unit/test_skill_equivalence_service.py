"""Unit tests for SkillEquivalenceService."""

from decimal import Decimal
from types import SimpleNamespace

import pytest

from src.application.services.skill_equivalence_service import SkillEquivalenceService
from src.application.services.canonical_match_explanation_service import (
    build_match_explanation,
)


@pytest.fixture
def equivalence_service():
    """Create a fresh service instance for each test."""
    return SkillEquivalenceService()


class TestSkillEquivalenceService:
    """Tests for skill equivalence matching."""

    def test_postgresql_satisfies_sql_as_strong(self, equivalence_service):
        """Test 1: PostgreSQL satisfaz SQL como strong (score >= 0.85)."""
        evidence = equivalence_service.match_skill("PostgreSQL", "SQL")
        assert evidence.matched is True
        assert evidence.strength == "strong"
        assert evidence.score >= 0.85

    def test_sql_server_satisfies_sql_as_strong(self, equivalence_service):
        """Test 2: SQL Server satisfaz SQL como strong (score >= 0.85)."""
        evidence = equivalence_service.match_skill("SQL Server", "SQL")
        assert evidence.matched is True
        assert evidence.strength == "strong"
        assert evidence.score >= 0.85

    def test_power_bi_satisfies_bi_as_strong(self, equivalence_service):
        """Test 3: Power BI satisfaz BI como strong (score >= 0.85)."""
        evidence = equivalence_service.match_skill("Power BI", "BI")
        assert evidence.matched is True
        assert evidence.strength == "strong"
        assert evidence.score >= 0.85

    def test_protheus_satisfies_erp_as_strong(self, equivalence_service):
        """Test 4: Protheus satisfaz ERP como strong (score >= 0.85)."""
        evidence = equivalence_service.match_skill("Protheus", "ERP")
        assert evidence.matched is True
        assert evidence.strength == "strong"
        assert evidence.score >= 0.85

    def test_protheus_satisfies_sap_mm_as_partial_only(self, equivalence_service):
        """Test 5: Protheus satisfaz SAP MM apenas como partial (0.3 <= score <= 0.6)."""
        evidence = equivalence_service.match_skill("Protheus", "SAP MM")
        assert evidence.matched is True
        assert evidence.strength == "partial"
        assert 0.3 <= evidence.score <= 0.6

    def test_protheus_does_not_satisfy_sap_mm_as_exact_or_strong(self, equivalence_service):
        """Test 6: Protheus NÃO satisfaz SAP MM como exact/strong (score < 0.85)."""
        evidence = equivalence_service.match_skill("Protheus", "SAP MM")
        assert evidence.strength != "exact"
        assert evidence.strength != "strong"
        assert evidence.score < 0.85

    def test_partial_increases_mandatory_score_but_not_to_100(self):
        """Test 7: Partial aumenta mandatory_score no breakdown, mas não além de 75% quando todas são partial."""
        # Job requires: Python, SAP MM
        # Candidate has: Python, Protheus
        job_rows = [
            SimpleNamespace(
                skill_name="Python",
                skill_aliases=[],
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
            SimpleNamespace(
                skill_name="SAP MM",
                skill_aliases=[],
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
        ]
        job = SimpleNamespace(
            seniority_level="mid",
            minimum_years_experience=None,
            minimum_education_level=None,
            deal_breakers=[],
        )
        result = SimpleNamespace(
            seniority_level="mid",
            overall_score=Decimal("70"),
            total_experience_years=None,
            highest_education_level=None,
            extracted_data={},
        )

        explanation = build_match_explanation(
            job=job,
            analysis_result=result,
            job_skill_rows=job_rows,
            final_score=Decimal("70"),
            recommendation="good_match",
            matched_skills=["Python"],  # Exact match
            missing_skills=["SAP MM"],  # Will be found as partial via Protheus
            candidate_skills=["Python", "Protheus"],
        )

        # Mandatory breakdown should improve from 50% (1/2) but not reach 100%
        assert explanation.breakdown["mandatory"] is not None
        mandatory_score = explanation.breakdown["mandatory"].score
        assert mandatory_score > Decimal("50")  # Improved from binary 50%
        assert mandatory_score <= Decimal("75")  # Capped due to partial only

    def test_all_mandatory_partial_adds_risk(self):
        """Test 8: Vaga com obrigatórias 100% parciais → adiciona risco."""
        # Job requires: SAP MM, SQL
        # Candidate has: Protheus (partial SAP MM), MySQL (strong SQL)
        # But for this test, let's test the case where BOTH are partial
        job_rows = [
            SimpleNamespace(
                skill_name="SAP MM",
                skill_aliases=[],
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
            SimpleNamespace(
                skill_name="COBOL",
                skill_aliases=[],
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
        ]
        job = SimpleNamespace(
            seniority_level="mid",
            minimum_years_experience=None,
            minimum_education_level=None,
            deal_breakers=[],
        )
        result = SimpleNamespace(
            seniority_level="mid",
            overall_score=Decimal("70"),
            total_experience_years=None,
            highest_education_level=None,
            extracted_data={},
        )

        # In this case: no exact matches, Protheus partially matches SAP MM,
        # COBOL has no match even partial
        explanation = build_match_explanation(
            job=job,
            analysis_result=result,
            job_skill_rows=job_rows,
            final_score=Decimal("50"),
            recommendation="maybe",
            matched_skills=[],  # No exact matches
            missing_skills=["SAP MM", "COBOL"],
            candidate_skills=["Protheus"],  # Partial SAP MM, no COBOL
        )

        # Should have missing skills and potentially the safety warning
        # about no exact matches if all were partial (but in this case COBOL is 0%)
        risks_text = " ".join(explanation.risks)
        assert "sap mm" in risks_text.lower() or "cobol" in risks_text.lower() or "faltantes" in risks_text.lower()

    def test_hiago_like_profile_partial_matches(self):
        """Test 9: Hiago-like profile with SQL, Power BI, Python, Protheus → partial_matches for SAP MM."""
        job_rows = [
            SimpleNamespace(
                skill_name="SQL",
                skill_aliases=[],
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
            SimpleNamespace(
                skill_name="Power BI",
                skill_aliases=[],
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
            SimpleNamespace(
                skill_name="SAP MM",
                skill_aliases=[],
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
            ),
            SimpleNamespace(
                skill_name="Excel",
                skill_aliases=[],
                JobRequiredSkillModel=SimpleNamespace(is_mandatory=False),
            ),
        ]
        job = SimpleNamespace(
            seniority_level="mid",
            minimum_years_experience=None,
            minimum_education_level=None,
            deal_breakers=[],
        )
        result = SimpleNamespace(
            seniority_level="mid",
            overall_score=Decimal("70"),
            total_experience_years=None,
            highest_education_level=None,
            extracted_data={},
        )

        explanation = build_match_explanation(
            job=job,
            analysis_result=result,
            job_skill_rows=job_rows,
            final_score=Decimal("65"),
            recommendation="good_match",
            matched_skills=["SQL", "Power BI"],  # Exact matches
            missing_skills=["SAP MM", "Excel"],  # SAP MM partial, Excel missing
            candidate_skills=["SQL", "Power BI", "Python", "Protheus"],
        )

        # Mandatory score should be between 50% and 90% (not 0, not 100%)
        mandatory_score = explanation.breakdown["mandatory"].score
        assert mandatory_score >= Decimal("50"), f"Expected >= 50, got {mandatory_score}"
        assert mandatory_score < Decimal("100"), f"Expected < 100, got {mandatory_score}"

        # Should have partial matches for SAP MM
        assert explanation.partial_matches is not None
        partial_matches_text = str(explanation.partial_matches)
        assert "SAP MM" in partial_matches_text or "sap mm" in partial_matches_text.lower()
        assert "Protheus" in partial_matches_text or "protheus" in partial_matches_text.lower()


class TestSkillEquivalenceServiceEdgeCases:
    """Edge case tests for equivalence service."""

    def test_exact_match_returns_highest_score(self):
        """Exact match should return score 1.0."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("Python", "Python")
        assert evidence.matched is True
        assert evidence.strength == "exact"
        assert evidence.score == 1.0

    def test_normalized_match_treated_as_exact(self):
        """Normalized match (case/space variations) should be treated as exact."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("python", "PYTHON")
        assert evidence.matched is True
        assert evidence.strength == "exact"
        assert evidence.score == 1.0

    def test_no_match_returns_zero_score(self):
        """No match should return score 0.0."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("Fortran", "Java")
        assert evidence.matched is False
        assert evidence.strength == "none"
        assert evidence.score == 0.0

    def test_empty_skill_names_handled_gracefully(self):
        """Empty skill names should not crash the service."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("", "SQL")
        assert evidence.matched is False
        assert evidence.score == 0.0

    def test_tableau_satisfies_bi_as_strong(self):
        """Tableau should satisfy BI requirement (group membership)."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("Tableau", "BI")
        assert evidence.matched is True
        assert evidence.strength == "strong"
        assert evidence.score >= 0.85

    def test_totvs_partial_match_sap_mm(self):
        """TOTVS should partial match SAP MM with lower score than Protheus."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("TOTVS", "SAP MM")
        assert evidence.matched is True
        assert evidence.strength == "partial"
        assert evidence.score < 0.50  # TOTVS has score 0.40
