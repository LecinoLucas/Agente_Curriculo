"""Unit tests for analysis service skill scoring with equivalence."""

from decimal import Decimal
from types import SimpleNamespace

import pytest

from src.application.services.analysis_service import (
    _canonical_component_weights,
    _compute_skill_scores,
    _extract_resume_text_experience_years,
    _extract_resume_text_skill_names,
    _skill_names_from_extracted_data,
)


def _row(name: str, *, mandatory: bool = True):
    """Helper to create a job skill row."""
    return SimpleNamespace(
        skill_name=name,
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=mandatory),
    )


def _overall_skill_score(job_skills: list, candidate_skills: set[str]) -> Decimal:
    scores = _compute_skill_scores(job_skills, candidate_skills)
    mandatory_total = sum(1 for row in job_skills if row.JobRequiredSkillModel.is_mandatory)
    optional_total = sum(1 for row in job_skills if not row.JobRequiredSkillModel.is_mandatory)
    weights = _canonical_component_weights(
        total_mandatory=mandatory_total,
        total_optional=optional_total,
    )
    return (
        scores["mandatory_score_weighted"] * weights["mandatory"]
        + scores["optional_score_weighted"] * weights["optional"]
        + Decimal("100") * weights["experience"]
        + Decimal("100") * weights["seniority"]
    ).quantize(Decimal("0.01"))


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

    def test_structured_skills_do_not_use_job_keyword_contamination(self):
        """Structured extracted skills are the candidate skill source, not job keywords."""
        structured_skills = _skill_names_from_extracted_data({
            "skills": [
                {"name": "React"},
                {"name": "Node.js"},
                {"name": "PostgreSQL"},
                {"name": "Docker"},
            ]
        })

        result = _compute_skill_scores(
            [
                _row("React Native"),
                _row("TypeScript"),
                _row("Node.js"),
                _row("SQL Server"),
            ],
            {skill.lower() for skill in structured_skills},
        )

        assert result["mandatory_matched"] == 1
        assert result["matched_skill_names"] == ["Node.js"]
        assert "React Native" in result["missing_skill_names"]
        assert [item["required"] for item in result["partial_matches"]] == ["TypeScript", "SQL Server"]

    def test_exact_mandatory_match_is_not_degraded_without_context(self):
        """Exact structured skill keeps full coverage even when evidence context is weak."""
        result = _compute_skill_scores(
            [_row("Node.js")],
            {"node.js"},
            candidate_skill_context={
                "node.js": {"confidence": "medium", "has_context": False, "source": "skill_mention"},
            },
            weaken_uncontextualized=True,
        )

        assert result["mandatory_score_weighted"] == Decimal("100.00")
        assert result["mandatory_matched"] == 1
        assert result["partial_matches"] == []
        assert result["weak_evidence_required_skills"] == []
        evidence = result["skill_evidence_details"][0]
        assert evidence["match_type"] == "exact"
        assert evidence["coverage"] == 1.0
        assert evidence["evidence_strength"] == "weak"
        assert evidence["context_missing"] is True

    def test_keyword_only_skills_are_weakened_vs_contextual_evidence(self):
        """Keyword stuffing without context must score below contextual experience."""
        job_skills = [_row("SQL", mandatory=True), _row("Python", mandatory=True)]
        candidate_skills = {"sql", "python"}

        weak_result = _compute_skill_scores(
            job_skills,
            candidate_skills,
            candidate_skill_context={
                "sql": {"confidence": "low", "has_context": False, "source": "keyword_fallback"},
                "python": {"confidence": "low", "has_context": False, "source": "keyword_fallback"},
            },
            weaken_uncontextualized=True,
        )
        strong_result = _compute_skill_scores(
            job_skills,
            candidate_skills,
            candidate_skill_context={
                "sql": {"confidence": "high", "has_context": True, "source": "experience"},
                "python": {"confidence": "high", "has_context": True, "source": "experience"},
            },
            weaken_uncontextualized=True,
        )

        assert weak_result["mandatory_score_weighted"] < strong_result["mandatory_score_weighted"]
        assert weak_result["mandatory_matched"] < strong_result["mandatory_matched"]
        assert "SQL" in weak_result["weak_evidence_required_skills"]
        assert "Python" in weak_result["weak_evidence_required_skills"]

    def test_keyword_fallback_exact_term_is_still_weakened(self):
        """Loose keyword fallback must not become full exact evidence."""
        result = _compute_skill_scores(
            [_row("Node.js", mandatory=True)],
            {"node.js"},
            candidate_skill_context={
                "node.js": {"confidence": "low", "has_context": False, "source": "keyword_fallback"},
            },
            weaken_uncontextualized=True,
        )

        assert result["mandatory_matched"] == 0
        assert result["mandatory_score_weighted"] == Decimal("55.00")
        assert result["partial_matches"][0]["required"] == "Node.js"
        assert result["partial_matches"][0]["weak_evidence"] is True

    def test_typescript_to_javascript_skill_mention_keeps_strong_equivalence(self):
        """Explicit skill mention with strong equivalence should keep mandatory coverage."""
        result = _compute_skill_scores(
            [_row("JavaScript", mandatory=True)],
            {"typescript"},
            candidate_skill_context={
                "typescript": {"confidence": "medium", "has_context": False, "source": "skill_mention"},
            },
            weaken_uncontextualized=True,
        )

        assert result["mandatory_matched"] == 1
        assert "JavaScript" in result["matched_skill_names"]
        assert "JavaScript" not in result["missing_skill_names"]
        assert result["mandatory_score_weighted"] >= Decimal("85")
        assert result["partial_matches"] == []
        assert result["mandatory_strong_coverage"] == Decimal("100.00")

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

    def test_strong_equivalence_satisfies_mandatory_even_with_weak_context(self):
        """Strong canonical equivalence should count as mandatory ok."""
        result = _compute_skill_scores(
            [_row("SQL", mandatory=True)],
            {"postgresql"},
            candidate_skill_context={
                "postgresql": {"confidence": "medium", "has_context": False, "source": "skill_mention"},
            },
            weaken_uncontextualized=True,
        )

        assert result["mandatory_matched"] == 1
        assert result["mandatory_strong_coverage"] == Decimal("100.00")
        assert result["mandatory_score_weighted"] >= Decimal("85")
        assert "SQL" in result["matched_skill_names"]
        assert "SQL" not in result["missing_skill_names"]
        assert result["partial_matches"] == []
        evidence = result["skill_evidence_details"][0]
        assert evidence["equivalence_strength"] == "strong"
        assert evidence["fulfills_requirement"] is True
        assert evidence["weak_evidence"] is False

    def test_keyword_fallback_strong_equivalence_does_not_satisfy_mandatory(self):
        """Loose keyword fallback cannot satisfy a mandatory skill via equivalence alone."""
        result = _compute_skill_scores(
            [_row("SQL", mandatory=True)],
            {"postgresql"},
            candidate_skill_context={
                "postgresql": {"confidence": "low", "has_context": False, "source": "keyword_fallback"},
            },
            weaken_uncontextualized=True,
        )

        assert result["mandatory_matched"] == 0
        assert "SQL" in result["missing_skill_names"]
        assert result["partial_matches"][0]["required"] == "SQL"
        evidence = result["skill_evidence_details"][0]
        assert evidence["equivalence_strength"] == "strong"
        assert evidence["fulfills_requirement"] is False
        assert evidence["weak_evidence"] is True

    def test_partial_or_generic_match_does_not_satisfy_mandatory(self):
        """Broad generic matches must remain partial, not mandatory ok."""
        result = _compute_skill_scores(
            [_row("Python", mandatory=True)],
            {"node.js"},
            candidate_skill_context={
                "node.js": {"confidence": "medium", "has_context": False, "source": "skill_mention"},
            },
            weaken_uncontextualized=True,
        )

        assert result["mandatory_matched"] == 0
        assert "Python" in result["missing_skill_names"]
        assert result["partial_matches"][0]["required"] == "Python"

    def test_candidate_with_mandatory_fit_stays_above_candidate_without_mandatory_fit(self):
        """Strong mandatory coverage must outrank optional-only profiles."""
        job_skills = [
            *[_row(skill, mandatory=True) for skill in ("Python", "JavaScript", "Node.js", "SQL", "Backend", "Frontend")],
            *[_row(skill, mandatory=False) for skill in (
                "React", "Docker", "Kubernetes", "CI/CD", "PostgreSQL", "Redis",
                "GraphQL", "RabbitMQ", "API", "Microservices", "Serverless", "Git",
                "DevOps", "NoSQL", "API REST", "Testes",
            )],
        ]

        strong_mandatory = _overall_skill_score(
            job_skills,
            {"python", "javascript", "node.js", "sql", "backend", "frontend", "react", "docker"},
        )
        no_mandatory = _overall_skill_score(
            job_skills,
            {"react", "docker", "kubernetes", "ci/cd", "postgresql", "redis", "graphql", "rabbitmq"},
        )

        assert strong_mandatory > no_mandatory

    def test_increasing_optional_list_from_five_to_sixteen_does_not_crush_score(self):
        """Extra optional requirements past the cap cannot derrubar drasticamente o score."""
        mandatory_skills = [_row(skill, mandatory=True) for skill in ("Python", "JavaScript", "Node.js", "SQL", "Backend", "Frontend")]
        job_five_optional = mandatory_skills + [_row(skill, mandatory=False) for skill in ("React", "Docker", "Kubernetes", "CI/CD", "PostgreSQL")]
        job_sixteen_optional = mandatory_skills + [_row(skill, mandatory=False) for skill in (
            "React", "Docker", "Kubernetes", "CI/CD", "PostgreSQL", "Redis", "GraphQL", "RabbitMQ",
            "API", "Microservices", "Serverless", "Git", "DevOps", "NoSQL", "API REST", "Testes",
        )]
        candidate_skills = {"python", "javascript", "node.js", "sql", "backend", "frontend", "react", "docker"}

        score_five = _overall_skill_score(job_five_optional, candidate_skills)
        score_sixteen = _overall_skill_score(job_sixteen_optional, candidate_skills)

        assert score_sixteen >= score_five
        assert (score_sixteen - score_five) <= Decimal("5.00")

    def test_optional_skills_add_limited_bonus_without_heavy_penalty(self):
        """Optional requirements should increase score as bonus, not punish by list length."""
        job_skills = [
            *[_row(skill, mandatory=True) for skill in ("Python", "JavaScript", "Node.js", "SQL", "Backend", "Frontend")],
            *[_row(skill, mandatory=False) for skill in (
                "React", "Docker", "Kubernetes", "CI/CD", "PostgreSQL", "Redis", "GraphQL", "RabbitMQ",
                "API", "Microservices", "Serverless", "Git", "DevOps", "NoSQL", "API REST", "Testes",
            )],
        ]

        mandatory_only = _overall_skill_score(
            job_skills,
            {"python", "javascript", "node.js", "sql", "backend", "frontend"},
        )
        with_optional_bonus = _overall_skill_score(
            job_skills,
            {"python", "javascript", "node.js", "sql", "backend", "frontend", "react", "docker"},
        )

        assert with_optional_bonus > mandatory_only
        assert (with_optional_bonus - mandatory_only) <= Decimal("7.00")

    def test_resume_text_fallback_extracts_explicit_backend_and_declared_skills(self):
        resume_text = (
            "Nodejs | Typescript | Javascript | SQL | DevOps\n"
            "Desenvolvimento de back-end\n"
            "Desenvolvedor backend"
        )
        job_skills = [
            _row("Backend", mandatory=True),
            _row("JavaScript", mandatory=True),
            _row("SQL", mandatory=True),
            _row("Frontend", mandatory=True),
        ]

        extracted = _extract_resume_text_skill_names(resume_text, job_skills)

        assert extracted == ["Backend", "JavaScript", "SQL"]

    def test_resume_text_fallback_extracts_experience_years_from_duration(self):
        years = _extract_resume_text_experience_years(
            "outubro de 2020 - Present (5 anos 7 meses)"
        )

        assert years == Decimal("5.6")

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
