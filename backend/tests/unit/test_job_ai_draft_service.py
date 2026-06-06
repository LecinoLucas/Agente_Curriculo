"""Unit tests — JobAiDraftService (Fase IA Vaga 3).

All tests are in-process. AI provider is always mocked — no real network calls.
DB session is mocked to prevent any I/O.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.application.ports.ai_service import AIAnalysisResponse
from src.application.services.job_ai_draft_service import (
    MAX_COMBINED_CHARS,
    MAX_OCR_TEXT_CHARS,
    MAX_TEXT_INPUT_CHARS,
    JobAiDraftService,
)
from src.application.services.job_ai_draft_rules import (
    AiDraftAIError,
    AiDraftParseError,
    AiDraftValidationError,
    _nonempty_str,
    parse_draft as _parse_draft,
    sanitize as _sanitize,
    _SYSTEM_PROMPT,
)

# ── Fixtures & factories ──────────────────────────────────────────────────────

_DRAFT_JSON: dict = {
    "title": "Operador de Caixa",
    "area": "Atendimento",
    "seniority": None,
    "work_model": "onsite",
    "unit": "São Paulo, SP",
    "salary_min": None,
    "salary_max": None,
    "description": "Vaga para operador de caixa em loja de varejo.",
    "responsibilities": ["Operar caixa registradora", "Atender clientes"],
    "requirements": ["Ensino médio completo"],
    "mandatory_skills": ["Atendimento ao cliente"],
    "nice_to_have_skills": ["Experiência em varejo"],
    "benefits": [],
    "working_hours": "6x1",
    "screening_questions": ["Tem disponibilidade para turno integral?"],
    "pipeline_steps": ["Triagem", "Entrevista RH", "Decisão"],
    "matching_criteria": ["Experiência em atendimento ao cliente"],
    "requires_manager_review": True,
    "requires_behavioral_assessment": False,
}


def _ai_response(
    content: str | None = None, input_tokens: int = 150, output_tokens: int = 80
) -> AIAnalysisResponse:
    return AIAnalysisResponse(
        content=content if content is not None else json.dumps(_DRAFT_JSON),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=0,
        cache_write_tokens=0,
        processing_time_ms=200,
    )


def _mock_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    return session


def _mock_ai(response: AIAnalysisResponse | None = None) -> AsyncMock:
    ai = AsyncMock()
    ai.analyze = AsyncMock(return_value=response or _ai_response())
    return ai


# ── Validation ────────────────────────────────────────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestAiDraftServiceValidation:
    @pytest.mark.asyncio
    async def test_raises_when_both_inputs_none(self) -> None:
        svc = JobAiDraftService()
        with (
            patch("src.application.services.job_ai_draft_service.AIServiceFactory.create"),
            pytest.raises(AiDraftValidationError),
        ):
            await svc.generate(text_input=None, ocr_text=None, session=_mock_session())

    @pytest.mark.asyncio
    async def test_raises_when_both_inputs_empty_string(self) -> None:
        svc = JobAiDraftService()
        with (
            patch("src.application.services.job_ai_draft_service.AIServiceFactory.create"),
            pytest.raises(AiDraftValidationError),
        ):
            await svc.generate(text_input="", ocr_text="", session=_mock_session())

    @pytest.mark.asyncio
    async def test_raises_when_both_inputs_only_whitespace(self) -> None:
        svc = JobAiDraftService()
        with (
            patch("src.application.services.job_ai_draft_service.AIServiceFactory.create"),
            pytest.raises(AiDraftValidationError),
        ):
            await svc.generate(text_input="   \n  ", ocr_text="\t\n", session=_mock_session())


# ── Happy Path ────────────────────────────────────────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestAiDraftServiceHappyPath:
    @pytest.mark.asyncio
    async def test_text_input_only_returns_result(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(),
        ):
            result = await svc.generate(
                text_input="Operador de Caixa para loja de varejo",
                ocr_text=None,
                session=session,
            )
        assert result.draft.title == "Operador de Caixa"
        assert result.source.text_used is True
        assert result.source.ocr_used is False

    @pytest.mark.asyncio
    async def test_ocr_text_only_returns_result(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(),
        ):
            result = await svc.generate(
                text_input=None,
                ocr_text="Texto extraído de imagem de vaga",
                session=session,
            )
        assert result.draft is not None

    @pytest.mark.asyncio
    async def test_ocr_only_sets_ocr_used_true(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(),
        ):
            result = await svc.generate(
                text_input=None,
                ocr_text="Texto extraído de imagem de vaga",
                session=session,
            )
        assert result.source.text_used is False
        assert result.source.ocr_used is True
        assert result.source.input_character_count > 0

    @pytest.mark.asyncio
    async def test_both_inputs_set_both_flags(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(),
        ):
            result = await svc.generate(
                text_input="Vaga de caixa",
                ocr_text="Texto OCR",
                session=session,
            )
        assert result.source.text_used is True
        assert result.source.ocr_used is True

    @pytest.mark.asyncio
    async def test_both_inputs_combined_successfully(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(),
        ) as factory_mock:
            await svc.generate(
                text_input="Vaga de caixa",
                ocr_text="Texto OCR da imagem",
                session=session,
            )
        ai_instance = factory_mock.return_value
        call_args = ai_instance.analyze.call_args[0][0]
        assert "Vaga de caixa" in call_args.prompt_template
        assert "Texto OCR da imagem" in call_args.prompt_template

    @pytest.mark.asyncio
    async def test_usage_populated_from_ai_response(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(input_tokens=300, output_tokens=120)),
        ):
            result = await svc.generate(
                text_input="Operador de Caixa",
                ocr_text=None,
                session=session,
            )
        assert result.usage.input_tokens == 300
        assert result.usage.output_tokens == 120
        assert result.usage.total_tokens == 420
        assert "estimated_cost" in result.usage.__dataclass_fields__

    @pytest.mark.asyncio
    async def test_draft_fields_populated(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(),
        ):
            result = await svc.generate(
                text_input="Operador de Caixa para São Paulo, SP. Jornada 6x1.",
                ocr_text=None,
                session=session,
            )
        d = result.draft
        assert d.title == "Operador de Caixa"
        assert d.area == "Atendimento"
        assert d.work_model == "onsite"
        assert d.unit == "São Paulo, SP"
        assert d.seniority is None
        assert d.working_hours == "6x1"
        assert d.requires_manager_review is True
        assert d.requires_behavioral_assessment is False
        assert isinstance(d.responsibilities, list)
        assert isinstance(d.mandatory_skills, list)
        assert isinstance(d.screening_questions, list)
        assert isinstance(d.matching_criteria, list)


# ── Needs Review logic ────────────────────────────────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestNeedsReview:
    @pytest.mark.asyncio
    async def test_salary_range_always_flagged(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(),
        ):
            result = await svc.generate(
                text_input="Operador de Caixa",
                ocr_text=None,
                session=session,
            )
        assert "salary_range" in result.needs_review

    @pytest.mark.asyncio
    async def test_unit_flagged_when_unit_absent(self) -> None:
        draft_no_unit = dict(_DRAFT_JSON, unit=None)
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_no_unit))),
        ):
            result = await svc.generate(
                text_input="Vaga sem unidade",
                ocr_text=None,
                session=session,
            )
        assert "unit" in result.needs_review

    @pytest.mark.asyncio
    async def test_work_model_flagged_when_absent(self) -> None:
        draft_no_wm = dict(_DRAFT_JSON, work_model=None)
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_no_wm))),
        ):
            result = await svc.generate(
                text_input="Vaga sem modelo de trabalho",
                ocr_text=None,
                session=session,
            )
        assert "work_model" in result.needs_review

    @pytest.mark.asyncio
    async def test_no_extra_flags_when_all_fields_present(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(),
        ):
            result = await svc.generate(
                text_input="Vaga completa para Operador de Caixa em São Paulo, SP, escala 6x1",
                ocr_text=None,
                session=session,
            )
        # salary_range always present, but not unit/work_model/description/title
        assert "unit" not in result.needs_review
        assert "work_model" not in result.needs_review


# ── Error handling ────────────────────────────────────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestAiDraftServiceErrors:
    @pytest.mark.asyncio
    async def test_ai_provider_error_raises_ai_draft_ai_error(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        failing_ai = AsyncMock()
        failing_ai.analyze = AsyncMock(side_effect=RuntimeError("provider unreachable"))
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=failing_ai,
            ),
            pytest.raises(AiDraftAIError),
        ):
            await svc.generate(
                text_input="Operador de Caixa",
                ocr_text=None,
                session=session,
            )

    @pytest.mark.asyncio
    async def test_invalid_json_response_raises_parse_error(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        bad_ai = _mock_ai(_ai_response(content="not valid json at all !!"))
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=bad_ai,
            ),
            pytest.raises(AiDraftParseError),
        ):
            await svc.generate(
                text_input="Operador de Caixa",
                ocr_text=None,
                session=session,
            )

    @pytest.mark.asyncio
    async def test_work_model_invalid_value_normalized_to_none(self) -> None:
        draft_bad_wm = dict(_DRAFT_JSON, work_model="presencial")  # not a valid enum
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_bad_wm))),
        ):
            result = await svc.generate(
                text_input="Vaga presencial",
                ocr_text=None,
                session=session,
            )
        assert result.draft.work_model is None
        assert "work_model" in result.needs_review


# ── Logging and Persistence ───────────────────────────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestTokenLogging:
    @pytest.mark.asyncio
    async def test_persist_usage_log_called_on_success(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=_mock_ai(),
            ),
            patch(
                "src.application.services.job_ai_draft_service.persist_ai_usage_log",
                new_callable=AsyncMock,
            ) as mock_log,
        ):
            await svc.generate(
                text_input="Operador de Caixa",
                ocr_text=None,
                session=session,
            )
        mock_log.assert_called_once()
        payload = mock_log.call_args[0][1]
        assert payload.status == "success"
        assert payload.operation == "job_ai_draft"

    @pytest.mark.asyncio
    async def test_persist_usage_log_not_called_on_ai_error(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        failing_ai = AsyncMock()
        failing_ai.analyze = AsyncMock(side_effect=RuntimeError("boom"))
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=failing_ai,
            ),
            patch(
                "src.application.services.job_ai_draft_service.persist_ai_usage_log",
                new_callable=AsyncMock,
            ) as mock_log,
            pytest.raises(AiDraftAIError),
        ):
            await svc.generate(
                text_input="Operador de Caixa",
                ocr_text=None,
                session=session,
            )
        mock_log.assert_not_called()


# ── Sanitisation ──────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestSanitize:
    def test_removes_null_bytes(self) -> None:
        assert "\x00" not in _sanitize("hello\x00world")

    def test_removes_control_chars(self) -> None:
        dirty = "ab\x01\x02cd\x0b\x0ced"
        clean = _sanitize(dirty)
        for ch in "\x01\x02\x0b\x0c":
            assert ch not in clean

    def test_preserves_newlines(self) -> None:
        assert "\n" in _sanitize("line1\nline2")

    def test_collapses_excess_newlines(self) -> None:
        assert "\n\n\n" not in _sanitize("a\n\n\n\n\nb")

    def test_normalises_unicode(self) -> None:
        nfd = "ã"  # 'a' + combining tilde (NFD)
        assert _sanitize(nfd) == "ã"

    def test_empty_string_returns_empty(self) -> None:
        assert _sanitize("") == ""

    def test_strips_leading_trailing_whitespace(self) -> None:
        assert _sanitize("  hello  ") == "hello"


# ── Truncation logic ──────────────────────────────────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestTruncation:
    @pytest.mark.asyncio
    async def test_oversized_text_input_is_truncated_not_rejected(self) -> None:
        huge = "x" * (MAX_TEXT_INPUT_CHARS + 5000)
        svc = JobAiDraftService()
        session = _mock_session()
        captured: list = []

        async def capture_analyze(req):
            captured.append(req)
            return _ai_response()

        mock_ai = AsyncMock()
        mock_ai.analyze = capture_analyze

        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=mock_ai,
        ):
            await svc.generate(text_input=huge, ocr_text=None, session=session)

        assert len(captured) == 1
        assert len(captured[0].resume_text) <= MAX_COMBINED_CHARS

    @pytest.mark.asyncio
    async def test_combined_text_respects_max_combined_chars(self) -> None:
        text_in = "a" * MAX_TEXT_INPUT_CHARS
        text_ocr = "b" * MAX_OCR_TEXT_CHARS
        svc = JobAiDraftService()
        session = _mock_session()
        captured: list = []

        async def capture_analyze(req):
            captured.append(req)
            return _ai_response()

        mock_ai = AsyncMock()
        mock_ai.analyze = capture_analyze

        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=mock_ai,
        ):
            await svc.generate(text_input=text_in, ocr_text=text_ocr, session=session)

        assert len(captured[0].resume_text) <= MAX_COMBINED_CHARS


# ── Security & Guardrails ─────────────────────────────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestSecurityGuardrails:
    """Tests validating anti-discriminatory and normalization rules."""

    # ── _nonempty_str helper ──────────────────────────────────────────────────

    def test_nonempty_str_returns_none_for_whitespace_only(self) -> None:
        assert _nonempty_str("   ") is None

    def test_nonempty_str_returns_none_for_empty_string(self) -> None:
        assert _nonempty_str("") is None

    def test_nonempty_str_returns_none_for_none(self) -> None:
        assert _nonempty_str(None) is None

    def test_nonempty_str_strips_and_returns_value(self) -> None:
        assert _nonempty_str("  Frentista  ") == "Frentista"

    # ── _parse_draft normalisation ────────────────────────────────────────────

    def test_title_whitespace_only_becomes_none(self) -> None:
        data = dict(_DRAFT_JSON, title="   ")
        draft = _parse_draft(data)
        assert draft.title is None

    def test_unit_whitespace_only_becomes_none(self) -> None:
        data = dict(_DRAFT_JSON, unit="\t\n")
        draft = _parse_draft(data)
        assert draft.unit is None

    def test_working_hours_whitespace_only_becomes_none(self) -> None:
        data = dict(_DRAFT_JSON, working_hours="   ")
        draft = _parse_draft(data)
        assert draft.working_hours is None

    def test_salary_null_when_not_in_data(self) -> None:
        """salary_min and salary_max must remain null when AI omits them."""
        data = dict(_DRAFT_JSON, salary_min=None, salary_max=None)
        draft = _parse_draft(data)
        assert draft.salary_min is None
        assert draft.salary_max is None

    def test_location_unit_null_when_not_in_data(self) -> None:
        """unit (location) must remain null when AI omits it."""
        data = dict(_DRAFT_JSON, unit=None)
        draft = _parse_draft(data)
        assert draft.unit is None

    def test_list_items_trimmed_and_empty_dropped(self) -> None:
        """_safe_list must strip whitespace and discard blank entries."""
        data = dict(_DRAFT_JSON, mandatory_skills=["  Python  ", "", "  ", "Java"])
        draft = _parse_draft(data)
        assert draft.mandatory_skills == ["Python", "Java"]

    # ── System prompt antidiscrimination content ──────────────────────────────

    def test_system_prompt_blocks_age_criteria(self) -> None:
        assert "idade" in _SYSTEM_PROMPT.lower() or "etária" in _SYSTEM_PROMPT.lower()

    def test_system_prompt_blocks_gender_criteria(self) -> None:
        assert "gênero" in _SYSTEM_PROMPT or "g\u00eanero" in _SYSTEM_PROMPT

    def test_system_prompt_blocks_race_criteria(self) -> None:
        prompt_lower = _SYSTEM_PROMPT.casefold()
        assert "ra" in prompt_lower and "a" in prompt_lower  # raça / raca
        assert any(k in prompt_lower for k in ("raça", "raca", "etnia", "cor"))

    def test_system_prompt_blocks_health_criteria(self) -> None:
        assert "saúde" in _SYSTEM_PROMPT or "sa\u00fade" in _SYSTEM_PROMPT

    def test_system_prompt_blocks_disability_criteria(self) -> None:
        prompt_lower = _SYSTEM_PROMPT.casefold()
        assert any(k in prompt_lower for k in ("deficiência", "deficiencia", "defici"))

    def test_system_prompt_antidiscrimination_section_present(self) -> None:
        assert "ANTIDISCRIMINAT" in _SYSTEM_PROMPT

    @pytest.mark.asyncio
    async def test_salary_not_invented_service_level(self) -> None:
        """When AI returns null salary, the service must propagate nulls."""
        draft_no_salary = dict(_DRAFT_JSON, salary_min=None, salary_max=None)
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_no_salary))),
        ):
            result = await svc.generate(
                text_input="Vaga sem menção de salário",
                ocr_text=None,
                session=session,
            )
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None
        assert "salary_range" in result.needs_review

    @pytest.mark.asyncio
    async def test_location_not_invented_service_level(self) -> None:
        """When AI returns null unit, service must propagate null and flag it."""
        draft_no_unit = dict(_DRAFT_JSON, unit=None)
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_no_unit))),
        ):
            result = await svc.generate(
                text_input="Vaga sem localização",
                ocr_text=None,
                session=session,
            )
        assert result.draft.unit is None
        assert "unit" in result.needs_review

    @pytest.mark.asyncio
    async def test_post_validation_strips_discriminatory_items_from_lists(self) -> None:
        draft_discriminatory = dict(_DRAFT_JSON, requirements=["Ensino médio", "Boa aparência", "Casado", "Sexo masculino"])
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_discriminatory))),
        ):
            result = await svc.generate(
                text_input="Vaga normal",
                ocr_text=None,
                session=session,
            )
        assert result.draft.requirements == ["Ensino médio"]
        assert any("potencial discriminatório" in w for w in result.warnings)
        assert "safety_check" in result.needs_review

    @pytest.mark.asyncio
    async def test_post_validation_flags_discriminatory_text_fields(self) -> None:
        draft_discriminatory = dict(_DRAFT_JSON, description="Vaga para pessoa do sexo feminino")
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_discriminatory))),
        ):
            result = await svc.generate(
                text_input="Vaga normal",
                ocr_text=None,
                session=session,
            )
        assert result.draft.description == "Vaga para pessoa do sexo feminino"
        assert any("conter termos discriminatórios" in w for w in result.warnings)
        assert "safety_check" in result.needs_review

    @pytest.mark.asyncio
    async def test_post_validation_removes_invented_salary(self) -> None:
        draft_invented = dict(_DRAFT_JSON, salary_min=2000, salary_max=3000)
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_invented))),
        ):
            result = await svc.generate(
                text_input="Vaga sem menção de salário",
                ocr_text=None,
                session=session,
            )
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None
        assert any("Salário inferido ou inventado" in w for w in result.warnings)
        assert "salary_range" in result.needs_review

    @pytest.mark.asyncio
    async def test_post_validation_keeps_real_salary(self) -> None:
        draft_real = dict(_DRAFT_JSON, salary_min=2000, salary_max=3000)
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_real))),
        ):
            result = await svc.generate(
                text_input="Vaga com salário de R$ 2000 a 3000",
                ocr_text=None,
                session=session,
            )
        assert result.draft.salary_min == 2000
        assert result.draft.salary_max == 3000

    @pytest.mark.asyncio
    async def test_post_validation_removes_invented_unit(self) -> None:
        draft_invented = dict(_DRAFT_JSON, unit="São Paulo, SP")
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_invented))),
        ):
            result = await svc.generate(
                text_input="Vaga remota",
                ocr_text=None,
                session=session,
            )
        assert result.draft.unit is None
        assert any("Local/unidade inferido ou inventado" in w for w in result.warnings)
        assert "unit" in result.needs_review

    @pytest.mark.asyncio
    async def test_post_validation_removes_invented_working_hours(self) -> None:
        draft_invented = dict(_DRAFT_JSON, working_hours="12x36")
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_invented))),
        ):
            result = await svc.generate(
                text_input="Vaga de atendimento",
                ocr_text=None,
                session=session,
            )
        assert result.draft.working_hours is None
        assert any("Jornada/escala inferida ou inventada" in w for w in result.warnings)

    def test_safe_list_deduplicates_case_insensitive(self) -> None:
        data = dict(_DRAFT_JSON, mandatory_skills=["Python", "python", "JAVA", "java", "C#"])
        draft = _parse_draft(data)
        assert draft.mandatory_skills == ["Python", "JAVA", "C#"]


# ── LangGraph Active Path ─────────────────────────────────────────────────────

import sys
from unittest.mock import MagicMock

# Mock out langgraph to allow testing the nodes and service interaction without the library installed
mock_langgraph = MagicMock()
mock_langgraph.graph.START = "START"
mock_langgraph.graph.END = "END"
sys.modules["langgraph"] = mock_langgraph
sys.modules["langgraph.graph"] = mock_langgraph.graph
sys.modules["langchain_core"] = MagicMock()
sys.modules["langchain_core.runnables"] = MagicMock()

from src.ai_orchestration.jobs.job_ai_draft_graph import (
    normalize_input_node,
    post_validate_node,
    build_job_ai_draft_graph
)

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", True)
class TestLangGraphActivePath:
    @pytest.mark.asyncio
    async def test_fallback_when_import_fails(self) -> None:
        """7. Se houver simulação de falha/import ausente do LangGraph, o fallback deve funcionar."""
        # By setting the module to None in sys.modules, Python raises ImportError on import
        with patch.dict("sys.modules", {"src.ai_orchestration.jobs.job_ai_draft_graph": None}):
            # JobAiDraftService will now catch ImportError and fallback
            svc = JobAiDraftService()
            with patch("src.application.services.job_ai_draft_service.AIServiceFactory.create") as m_ai:
                m_ai.return_value = _mock_ai()
                result = await svc.generate(text_input="Texto válido", ocr_text=None, session=_mock_session())
                assert result.draft.title == "Operador de Caixa"

    @pytest.mark.asyncio
    @patch("src.ai_orchestration.jobs.job_ai_draft_graph.build_job_ai_draft_graph")
    async def test_service_executes_graph_when_flag_true(self, mock_build: MagicMock) -> None:
        """1. Com JOB_AI_DRAFT_USE_LANGGRAPH=True, o JobAiDraftService deve executar o graph."""
        mock_graph = AsyncMock()
        mock_build.return_value = mock_graph
        
        # Prepare a mock state to return
        mock_graph.ainvoke.return_value = {
            "draft": _parse_draft(_DRAFT_JSON),
            "needs_review": ["safety_check"],
            "warnings": ["Warning do graph"],
            "usage": MagicMock(input_tokens=10, output_tokens=10, total_tokens=20, estimated_cost=None),
            "text_used": True,
            "ocr_used": False,
            "input_character_count": 100,
        }
        
        svc = JobAiDraftService()
        result = await svc.generate(text_input="Input mockado", ocr_text=None, session=_mock_session())
        
        # Verify graph was called
        mock_graph.ainvoke.assert_called_once()
        
        # Verify result is mapped correctly to AiDraftResult
        assert result.draft.title == "Operador de Caixa"
        assert result.warnings == ["Warning do graph"]
        assert result.needs_review == ["safety_check"]

    @pytest.mark.asyncio
    async def test_post_validate_node_removes_invented_salary(self) -> None:
        """3. Com LangGraph ativo, salary inventado deve ser descartado (sem dígitos no input)."""
        draft = _parse_draft(_DRAFT_JSON)
        draft.salary_min = 2000.0  # Invented
        state = {
            "draft": draft,
            "combined_text": "Apenas texto sem numeros."
        }
        
        result_state = await post_validate_node(state, {})
        assert result_state["draft"].salary_min is None
        assert any("Salário inferido ou inventado" in w for w in result_state["warnings"])

    @pytest.mark.asyncio
    async def test_post_validate_node_removes_discriminatory_items(self) -> None:
        """4. Com LangGraph ativo, itens discriminatórios em listas continuam sendo removidos.
           5. Com LangGraph ativo, warnings continuam sendo retornados."""
        draft = _parse_draft(_DRAFT_JSON)
        draft.requirements.append("Boa aparência")  # Discriminatory
        state = {
            "draft": draft,
            "combined_text": "Texto qualquer."
        }
        
        result_state = await post_validate_node(state, {})
        assert "Boa aparência" not in result_state["draft"].requirements
        assert any("potencial discriminatório" in w for w in result_state["warnings"])
        assert "safety_check" in result_state["needs_review"]

    @pytest.mark.asyncio
    async def test_refine_requirements_node(self) -> None:
        """Valida que requisitos sobrepostos são removidos do nice_to_have_skills."""
        from src.ai_orchestration.jobs.job_ai_draft_graph import refine_requirements_node
        draft = _parse_draft(_DRAFT_JSON)
        draft.mandatory_skills = ["Python", "FastAPI"]
        draft.nice_to_have_skills = ["Python", "Docker"]
        state = {"draft": draft}
        
        result = await refine_requirements_node(state, {})
        assert result["draft"].mandatory_skills == ["Python", "FastAPI"]
        assert result["draft"].nice_to_have_skills == ["Docker"]

    @pytest.mark.asyncio
    async def test_evaluate_quality_node(self) -> None:
        """Valida quality_score e emissão de warnings por missing fields."""
        from src.ai_orchestration.jobs.job_ai_draft_graph import evaluate_quality_node
        draft = _parse_draft(_DRAFT_JSON)
        draft.title = None
        draft.description = "Curto"
        draft.mandatory_skills = []
        state = {"draft": draft, "warnings": ["Previous Warning"]}
        
        result = await evaluate_quality_node(state, {})
        assert result["quality_score"] < 1.0
        assert "missing_field: missing_title" in result["warnings"]
        assert "missing_field: generic_description" in result["warnings"]
        assert "missing_field: weak_mandatory_requirements" in result["warnings"]
        assert "Previous Warning" in result["warnings"]
