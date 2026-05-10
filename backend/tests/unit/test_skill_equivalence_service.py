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

    def test_generic_sql_does_not_strongly_satisfy_postgresql(self, equivalence_service):
        """SQL genérico não deve comprovar PostgreSQL com peso alto."""
        evidence = equivalence_service.match_skill("SQL", "PostgreSQL")
        assert evidence.matched is True
        assert evidence.strength in {"partial", "weak"}
        assert evidence.score < 0.85

    def test_postgresql_does_not_strongly_satisfy_sql_server(self, equivalence_service):
        """Skills específicas irmãs não devem virar strong sem relação explícita."""
        evidence = equivalence_service.match_skill("PostgreSQL", "SQL Server")
        assert evidence.matched is True
        assert evidence.strength in {"partial", "weak"}
        assert evidence.score < 0.85

    def test_generic_javascript_does_not_strongly_satisfy_react(self, equivalence_service):
        """JavaScript genérico não deve comprovar React com força alta."""
        evidence = equivalence_service.match_skill("JavaScript", "React")
        assert evidence.strength in {"partial", "weak", "none"}
        assert evidence.score < 0.85

    def test_generic_cloud_does_not_strongly_satisfy_aws(self, equivalence_service):
        """Cloud genérico não deve comprovar AWS com força alta."""
        evidence = equivalence_service.match_skill("Cloud", "AWS")
        assert evidence.strength in {"partial", "weak", "none"}
        assert evidence.score < 0.85

    def test_generic_python_does_not_strongly_satisfy_fastapi(self, equivalence_service):
        """Python genérico não deve comprovar FastAPI com força alta."""
        evidence = equivalence_service.match_skill("Python", "FastAPI")
        assert evidence.matched is True
        assert evidence.strength in {"partial", "weak"}
        assert evidence.score < 0.85

    def test_generic_erp_does_not_strongly_satisfy_protheus(self, equivalence_service):
        """ERP genérico não deve comprovar Protheus com força alta."""
        evidence = equivalence_service.match_skill("ERP", "Protheus")
        assert evidence.matched is True
        assert evidence.strength in {"partial", "weak"}
        assert evidence.score < 0.85

    def test_power_bi_satisfies_bi_as_strong(self, equivalence_service):
        """Test 3: Power BI satisfaz BI como strong (score >= 0.85)."""
        evidence = equivalence_service.match_skill("Power BI", "BI")
        assert evidence.matched is True
        assert evidence.strength == "strong"
        assert evidence.score >= 0.85

    def test_protheus_satisfies_erp_as_category_related(self, equivalence_service):
        """ERP is a broad category, not a strong concrete-skill equivalent."""
        evidence = equivalence_service.match_skill("Protheus", "ERP")
        assert evidence.matched is True
        assert evidence.strength in {"partial", "weak"}
        assert evidence.score < 0.85

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

    def test_generic_bi_does_not_strongly_satisfy_power_bi(self):
        """Broad BI should not satisfy Power BI like a direct tool match."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("BI", "Power BI")
        assert evidence.matched is True
        assert evidence.strength in {"partial", "weak"}
        assert evidence.score < 0.85

    def test_totvs_partial_match_sap_mm(self):
        """TOTVS should partial match SAP MM with lower score than Protheus."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("TOTVS", "SAP MM")
        assert evidence.matched is True
        assert evidence.strength == "partial"
        assert evidence.score < 0.50  # TOTVS has score 0.40

    def test_area_level_match_is_partial_not_strong(self):
        """Broad area relations must not inflate score like exact/strong matches."""
        service = SkillEquivalenceService()
        evidence = service.match_skill("Python", "Backend")
        assert evidence.matched is True
        assert evidence.strength in {"partial", "weak"}
        assert evidence.score < 0.85

    def test_directional_broad_categories_do_not_satisfy_specific_skills(self):
        service = SkillEquivalenceService()
        broad_to_specific = [
            ("Backend", "Node.js"),
            ("Frontend", "React"),
            ("Cloud", "AWS"),
            ("ERP", "SAP"),
        ]

        for candidate_skill, required_skill in broad_to_specific:
            evidence = service.match_skill(candidate_skill, required_skill)
            assert evidence.strength in {"partial", "weak", "none"}
            assert evidence.score < 0.85


class TestSkillEquivalenceCatalogCrud:
    def test_create_group_updates_same_catalog_used_by_matching(self, tmp_path):
        catalog_path = tmp_path / "skill_equivalences.json"
        catalog_path.write_text(
            json.dumps(
                {
                    "version": "test",
                    "score_policy": {"exact": 1.0, "strong": 0.85, "partial": 0.45, "weak": 0.25},
                    "groups": [],
                    "relations": [],
                }
            ),
            encoding="utf-8",
        )
        SkillEquivalenceService.clear_catalog_cache()

        service = SkillEquivalenceService(catalog_path)
        created = service.create_group(
            {
                "canonical": "JavaScript",
                "aliases": ["TypeScript", "TS"],
                "domains": ["technology"],
                "type": "skill",
                "strength": "strong",
            }
        )

        assert created["id"] == "javascript"
        reloaded = SkillEquivalenceService(catalog_path)
        evidence = reloaded.match_skill("TypeScript", "JavaScript")
        assert evidence.matched is True
        assert evidence.strength == "strong"
        assert evidence.score == 0.85

    def test_update_and_delete_group_change_matching_result(self, tmp_path):
        catalog_path = tmp_path / "skill_equivalences.json"
        catalog_path.write_text(
            json.dumps(
                {
                    "version": "test",
                    "score_policy": {"exact": 1.0, "strong": 0.85, "partial": 0.45, "weak": 0.25},
                    "groups": [
                        {
                            "canonical": "BI",
                            "aliases": ["Power BI"],
                            "domain": ["data"],
                            "type": "skill",
                            "strength": "strong",
                        }
                    ],
                    "relations": [],
                }
            ),
            encoding="utf-8",
        )
        SkillEquivalenceService.clear_catalog_cache()

        service = SkillEquivalenceService(catalog_path)
        service.update_group("bi", {"aliases": ["Tableau"], "strength": "partial"})
        updated = SkillEquivalenceService(catalog_path)
        assert updated.match_skill("Power BI", "BI").matched is False
        tableau = updated.match_skill("Tableau", "BI")
        assert tableau.matched is True
        assert tableau.strength == "partial"

        updated.delete_group("bi")
        deleted = SkillEquivalenceService(catalog_path)
        assert deleted.match_skill("Tableau", "BI").matched is False

    def test_update_group_prunes_and_syncs_relations_that_would_override_admin_change(self, tmp_path):
        catalog_path = tmp_path / "skill_equivalences.json"
        catalog_path.write_text(
            json.dumps(
                {
                    "version": "test",
                    "score_policy": {"exact": 1.0, "strong": 0.85, "partial": 0.45, "weak": 0.25},
                    "groups": [
                        {
                            "canonical": "JavaScript",
                            "aliases": ["TypeScript", "React"],
                            "domain": ["technology"],
                            "type": "skill",
                            "strength": "strong",
                        }
                    ],
                    "relations": [
                        {
                            "from": "TypeScript",
                            "to": "JavaScript",
                            "strength": "strong",
                            "score": 0.9,
                            "reason": "explicit",
                        },
                        {
                            "from": "React",
                            "to": "JavaScript",
                            "strength": "strong",
                            "score": 0.9,
                            "reason": "explicit",
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )
        SkillEquivalenceService.clear_catalog_cache()

        service = SkillEquivalenceService(catalog_path)
        service.update_group("javascript", {"aliases": ["React"], "strength": "partial"})

        reloaded = SkillEquivalenceService(catalog_path)
        assert reloaded.match_skill("TypeScript", "JavaScript").matched is False
        react = reloaded.match_skill("React", "JavaScript")
        assert react.matched is True
        assert react.strength == "partial"
        assert react.score == 0.45
