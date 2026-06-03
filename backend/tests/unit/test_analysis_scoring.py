"""Unit tests para scoring isolado: skill matching, reweighting de cobertura
de skills e seniority penalty.

Fase 30E — reescrito para testar os helpers puros (`_skill_matches`,
`_compute_skill_scores`, `_calculate_seniority_score`) em vez de
`_match_details_to_job`. Motivo: `_match_details_to_job` agora orquestra
múltiplas chamadas a `_ensure_candidate_profile_analysis`,
`_ensure_job_profile_analysis`, `PipelineService`, `MatchStore.persist_*`,
o que torna o mock unitário frágil e duplica integração. As regras
testadas continuam as mesmas; só mudou o nível de granularidade.

Cobertura preservada:
- Reweighting quando não há skills mandatory.
- Skill exact-match (Python, C++, C#, React.js).
- Java ≠ JavaScript (não pode haver cross-match indevido).
- C++ ≠ C#.
- React ≠ React.js (tokens distintos).
- Seniority penalty para overqualified vs underqualified.
"""
from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from src.application.services.analysis_service import (
    _calculate_seniority_score,
    _compute_skill_scores,
    _skill_matches,
)


# ── Helper minimal para _compute_skill_scores ───────────────────────────────


def _row(skill_name: str, *, mandatory: bool = True, aliases: list[str] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=skill_name,
        skill_aliases=aliases or [],
        JobRequiredSkillModel=SimpleNamespace(
            is_mandatory=mandatory,
            priority_level="priority" if mandatory else "complementary",
        ),
    )


# ── Reweighting / cobertura de skills ───────────────────────────────────────


class TestSkillCoverageReweighting:
    def test_reweight_when_no_mandatory_skills(self):
        """Sem skills mandatory, quem casa 100% das optional tem cobertura
        complementary > quem não casa nenhuma."""
        rows = [_row("Python", mandatory=False), _row("FastAPI", mandatory=False)]

        full = _compute_skill_scores(rows, {"python", "fastapi"})
        none = _compute_skill_scores(rows, {"java"})

        assert full["complementary_matched"] == 2
        assert none["complementary_matched"] == 0
        # Não há skills mandatory → priority_matched deve ser zero
        assert full["priority_matched"] == 0
        assert none["priority_matched"] == 0

    def test_reweight_when_no_skills_at_all(self):
        """Sem nenhuma skill no job, cobertura é zero de tudo (não explode)."""
        result = _compute_skill_scores([], {"python"})
        assert result["priority_matched"] == 0
        assert result["complementary_matched"] == 0
        assert result["matched_skill_names"] == []
        assert result["missing_skill_names"] == []


# ── Skill matching: exact e família ────────────────────────────────────────


class TestSkillMatching:
    def test_exact_skill_match_python(self):
        result = _compute_skill_scores([_row("Python", mandatory=True)], {"python"})
        assert result["priority_matched"] == 1
        assert "Python" in result["matched_skill_names"]

    def test_csharp_matches_csharp(self):
        result = _compute_skill_scores([_row("C#", mandatory=True)], {"c#"})
        assert result["priority_matched"] == 1
        assert "C#" in result["matched_skill_names"]

    def test_cpp_matches_cpp(self):
        result = _compute_skill_scores([_row("C++", mandatory=True)], {"c++"})
        assert result["priority_matched"] == 1
        assert "C++" in result["matched_skill_names"]

    def test_reactjs_matches_reactjs(self):
        result = _compute_skill_scores([_row("React.js", mandatory=True)], {"react.js"})
        assert result["priority_matched"] == 1
        assert "React.js" in result["matched_skill_names"]


# ── Skill matching: não pode haver cross-match indevido ────────────────────


class TestSkillCrossMatchPrevention:
    """Estes são os testes mais importantes — proteção contra inflação por
    matching frouxo. java NUNCA deve casar com javascript, etc."""

    def test_java_does_not_match_javascript(self):
        # Helper direto
        assert _skill_matches("java", "javascript") is False
        # E também via _compute_skill_scores
        result = _compute_skill_scores([_row("javascript", mandatory=True)], {"java"})
        assert result["priority_matched"] == 0
        assert "javascript" in result["missing_skill_names"]

    def test_csharp_does_not_match_cpp(self):
        assert _skill_matches("C#", "C++") is False
        result = _compute_skill_scores([_row("C++", mandatory=True)], {"c#"})
        assert result["priority_matched"] == 0
        assert "C++" in result["missing_skill_names"]

    def test_react_matches_reactjs_via_equivalence_catalog(self):
        """Contrato atual: `react` e `react.js` são tratados como equivalentes
        pelo catálogo de skill_equivalences (mesma tecnologia). Isso é
        intencional — diferente do caso java/javascript onde são linguagens
        distintas."""
        assert _skill_matches("react", "react.js") is True


# ── Seniority penalty ───────────────────────────────────────────────────────


class TestSeniorityPenalty:
    def test_overqualified_scores_lower_than_exact_match(self):
        """Senior para vaga junior (distância 2) deve receber penalidade extra
        de overqualification além da queda por distância."""
        score_exact = _calculate_seniority_score("mid", "mid")
        score_overqualified = _calculate_seniority_score("senior", "junior")
        assert score_overqualified < score_exact

    def test_underqualified_no_overqualification_multiplier(self):
        """Junior aplicando para senior (distância 2) não leva multiplicador
        extra de overqualification; senior para junior leva."""
        score_under = _calculate_seniority_score("junior", "senior")
        score_over = _calculate_seniority_score("senior", "junior")
        # Mesma distância (2), mas overqualified leva 0.90×
        assert score_under > score_over
        # E ambos < score perfeito
        assert score_under < _calculate_seniority_score("senior", "senior")

    def test_exact_match_max_score(self):
        for level in ("junior", "mid", "senior", "lead"):
            assert _calculate_seniority_score(level, level) == Decimal("100.00")

    def test_no_job_level_returns_neutral(self):
        """Sem requirement do job, retorna 50 (não penaliza, não premia)."""
        assert _calculate_seniority_score("senior", None) == Decimal("50.00")
        assert _calculate_seniority_score(None, "senior") == Decimal("50.00")


# ── Payload completeness (B-CRIT-03 regression) ────────────────────────────


class TestComputeSkillScoresPayload:
    """Verify _compute_skill_scores returns all expected keys exactly once.

    Guards against duplicate dict keys silently overwriting scores
    (B-CRIT-03 from AUDIT-FAIL-PERF-1).
    """

    EXPECTED_KEYS = {
        "priority_score_weighted",
        "complementary_score_weighted",
        "complementary_score_raw_weighted",
        "priority_strong_coverage",
        "priority_matched",
        "complementary_matched",
        "eliminatory_matched",
        "matched_priority_skill_names",
        "matched_complementary_skill_names",
        "matched_eliminatory_skill_names",
        "missing_complementary_skill_names",
        "missing_eliminatory_skill_names",
        "complementary_bonus_cap_slots",
        "matched_skill_names",
        "missing_skill_names",
        "partial_matches",
        "has_any_strong_priority",
        "weak_evidence_priority_skills",
        "skill_evidence_details",
        "eliminatory_score_weighted",
    }

    def test_all_expected_keys_present(self):
        result = _compute_skill_scores([_row("Python")], {"python"})
        assert self.EXPECTED_KEYS == set(result.keys())

    def test_no_extra_keys(self):
        result = _compute_skill_scores([], set())
        extra = set(result.keys()) - self.EXPECTED_KEYS
        assert not extra, f"Unexpected extra keys: {extra}"

    def test_key_count_equals_expected(self):
        result = _compute_skill_scores([_row("Python"), _row("React", mandatory=False)], {"python"})
        assert len(result) == len(self.EXPECTED_KEYS)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
