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
    AiDraftAIError,
    AiDraftParseError,
    AiDraftValidationError,
    JobAiDraftService,
    _sanitize,
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


# ── Happy path ─────────────────────────────────────────────────────────────────

@pytest.mark.unit
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
                text_input="Vaga teste",
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


# ── needs_review ─────────────────────────────────────────────────────────────

@pytest.mark.unit
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
                text_input="Vaga completa",
                ocr_text=None,
                session=session,
            )
        # salary_range always present, but not unit/work_model/description/title
        assert "unit" not in result.needs_review
        assert "work_model" not in result.needs_review


# ── Error handling ────────────────────────────────────────────────────────────

@pytest.mark.unit
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


# ── Token logging ─────────────────────────────────────────────────────────────

@pytest.mark.unit
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


# ── Truncation ────────────────────────────────────────────────────────────────

@pytest.mark.unit
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
