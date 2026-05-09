"""Unit tests for SkillEquivalenceService."""

import json
from pathlib import Path

import pytest

from src.application.services.skill_equivalence_service import SkillEquivalenceService


CATALOG_PATH = (
    Path(__file__).resolve().parents[2]
    / "src"
    / "domain"
    / "catalogs"
    / "skill_equivalences.json"
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

    def test_typescript_satisfies_javascript_as_strong(self, equivalence_service):
        """TypeScript satisfaz JavaScript como strong."""
        evidence = equivalence_service.match_skill("TypeScript", "JavaScript")
        assert evidence.matched is True
        assert evidence.strength == "strong"
        assert evidence.score >= 0.85

    def test_react_satisfies_javascript_as_strong(self, equivalence_service):
        """React comprova uso pratico do ecossistema JavaScript."""
        evidence = equivalence_service.match_skill("React", "JavaScript")
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


class TestSkillEquivalenceCatalogContract:
    """Contract tests for the production equivalence catalog."""

    def test_catalog_has_no_duplicate_top_level_keys(self):
        duplicates = []

        def track_duplicates(pairs):
            seen = set()
            for key, _value in pairs:
                if key in seen:
                    duplicates.append(key)
                seen.add(key)
            return dict(pairs)

        json.loads(CATALOG_PATH.read_text(encoding="utf-8"), object_pairs_hook=track_duplicates)
        assert duplicates == []

    def test_catalog_uses_single_relations_source(self):
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        assert "additional_relations" not in catalog
        assert "additional_groups" not in catalog
        assert isinstance(catalog["relations"], list)
        assert isinstance(catalog["groups"], list)

    def test_catalog_relation_pairs_are_unique(self):
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        pairs = [
            (relation["from"].casefold(), relation["to"].casefold())
            for relation in catalog["relations"]
        ]
        assert len(pairs) == len(set(pairs))


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
