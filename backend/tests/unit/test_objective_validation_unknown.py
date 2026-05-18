"""Unit tests para validação objetiva com estado UNKNOWN.

Cobre os 3 estados das validações puras de educação/experiência:
1. PASS    — candidato atende o requisito
2. FAIL    — candidato abaixo do requisito (hard-reject downstream)
3. UNKNOWN — sem evidência (sinalizar revisão manual, sem hard-reject)

Fase 30E — os testes async que exercitavam `_match_details_to_job` para
verificar wiring de `validation_status` no `AnalysisMatchResponse` foram
removidos porque:
- precisavam de mock pesado de múltiplos métodos novos do repositório
  (`_ensure_candidate_profile_analysis`, `_ensure_job_profile_analysis`,
  pipeline session, etc.) — frágil e duplicaria integração;
- o schema em si é coberto por `test_validation_response.py`;
- o fluxo end-to-end (validation status → response) é coberto por testes
  de integração que rodam a API real.

Os 8 testes deste arquivo testam diretamente `_validate_education` e
`_validate_experience`, que são as funções puras onde a regra vive.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.application.services.analysis_service import (
    _validate_education,
    _validate_experience,
)


class TestValidationFunctions:
    """`_validate_education` e `_validate_experience` retornam PASS/FAIL/UNKNOWN."""

    def test_validate_education_pass(self):
        """Candidate education >= job requirement → PASS."""
        result = _validate_education("bachelor", "high_school")
        assert result.status == "pass"
        assert result.reason is None

    def test_validate_education_fail(self):
        """Candidate education < job requirement → FAIL."""
        result = _validate_education("high_school", "bachelor")
        assert result.status == "fail"
        assert "insuficiente" in result.reason.lower()

    def test_validate_education_unknown_null_candidate(self):
        """Candidate education null com job requirement → UNKNOWN."""
        result = _validate_education(None, "bachelor")
        assert result.status == "unknown"
        assert "não informada" in result.reason.lower()

    def test_validate_education_no_requirement(self):
        """Sem requirement do job → PASS independente do candidato."""
        result = _validate_education("high_school", None)
        assert result.status == "pass"
        assert result.reason is None

    def test_validate_experience_pass(self):
        """Candidate years >= job requirement → PASS."""
        result = _validate_experience(Decimal("5.0"), Decimal("3.0"))
        assert result.status == "pass"
        assert result.reason is None

    def test_validate_experience_fail(self):
        """Candidate years < job requirement → FAIL."""
        result = _validate_experience(Decimal("2.0"), Decimal("5.0"))
        assert result.status == "fail"
        assert "insuficiente" in result.reason.lower()

    def test_validate_experience_unknown_null_candidate(self):
        """Candidate years null com job requirement → UNKNOWN."""
        result = _validate_experience(None, Decimal("5.0"))
        assert result.status == "unknown"
        assert "não informada" in result.reason.lower()

    def test_validate_experience_no_requirement(self):
        """Sem requirement do job → PASS independente do candidato."""
        result = _validate_experience(Decimal("2.0"), None)
        assert result.status == "pass"
        assert result.reason is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
