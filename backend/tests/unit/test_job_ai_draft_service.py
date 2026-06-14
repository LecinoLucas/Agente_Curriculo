"""Unit tests — JobAiDraftService (Fase IA Vaga 3).

All tests are in-process. AI provider is always mocked — no real network calls.
DB session is mocked to prevent any I/O.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

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
    extract_requirements,
    extract_work_model,
    evaluate_quality,
    parse_draft as _parse_draft,
    post_validate as _post_validate,
    sanitize as _sanitize,
    _SYSTEM_PROMPT,
)
from src.application.services.skill_catalog_normalizer import normalize_skill_name
from src.infrastructure.database.models.skill_catalog_model import SkillAliasModel, SkillCatalogModel

# ── Fixtures & factories ──────────────────────────────────────────────────────

_DRAFT_JSON: dict = {
    "title": "Operador de Caixa",
    "area": "Atendimento",
    "seniority": None,
    "work_model": "onsite",
    "unit": "São Paulo, SP",
    "salary_min": None,
    "salary_max": None,
    "minimum_education_level": None,
    "minimum_years_experience": None,
    "experience_context": None,
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
    "suggested_skills": [
        {
            "name": "Atendimento ao cliente",
            "category": "behavioral",
            "aliases": ["Atendimento ao público", "Customer service"],
            "description": "Contato com clientes no varejo.",
            "importance": "essential",
            "source": "ai_suggested",
        }
    ],
    "selection_flow_type": None,
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
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=result)
    return session


def _mock_ai(response: AIAnalysisResponse | None = None) -> AsyncMock:
    ai = AsyncMock()
    ai.analyze = AsyncMock(return_value=response or _ai_response())
    return ai


def _catalog_skill(name: str, *, aliases: list[str] | None = None, category: str | None = "tool") -> SkillCatalogModel:
    skill = SkillCatalogModel(
        id=uuid4(),
        name=name,
        normalized_name=normalize_skill_name(name),
        category=category,
        description=None,
        domains=[],
        default_strength=None,
        catalog_type=None,
        is_active=True,
        created_by=None,
        updated_by=None,
        archived_at=None,
        archived_by=None,
        archive_reason=None,
        archive_reason_note=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    skill.aliases = [
        SkillAliasModel(
            id=uuid4(),
            skill_id=skill.id,
            alias=alias,
            normalized_alias=normalize_skill_name(alias),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        for alias in (aliases or [])
    ]
    return skill


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
                text_input="Operador de Caixa presencial para São Paulo, SP. Jornada 6x1. Processo com entrevista com gestor.",
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
        assert isinstance(d.suggested_skills, list)

    @pytest.mark.asyncio
    async def test_preserves_suggested_skill_aliases_from_ai(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        ai_payload = {
            **_DRAFT_JSON,
            "suggested_skills": [
                {
                    "name": "Suporte Protheus",
                    "category": "tool",
                    "aliases": ["TOTVS Protheus", "ERP Protheus", "Suporte TOTVS", "Suporte Protheus"],
                    "description": "Suporte operacional em ERP Protheus.",
                    "importance": "essential",
                    "source": "ai_suggested",
                }
            ],
        }
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=_mock_ai(_ai_response(content=json.dumps(ai_payload))),
            ),
            patch(
                "src.application.services.job_ai_draft_service.SQLAlchemySkillCatalogRepository.list_runtime_skills",
                new=AsyncMock(return_value=[]),
            ),
        ):
            result = await svc.generate(text_input="Suporte Protheus", ocr_text=None, session=session)

        assert result.draft.suggested_skills[0].name == "Suporte Protheus"
        assert result.draft.suggested_skills[0].aliases == [
            "TOTVS Protheus",
            "ERP Protheus",
            "Suporte TOTVS",
        ]

    @pytest.mark.asyncio
    async def test_marks_suggested_skill_as_existing_when_name_matches_catalog(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=_mock_ai(),
            ),
            patch(
                "src.application.services.job_ai_draft_service.SQLAlchemySkillCatalogRepository.list_runtime_skills",
                new=AsyncMock(return_value=[_catalog_skill("Atendimento ao cliente")]),
            ),
        ):
            result = await svc.generate(text_input="Atendimento ao cliente", ocr_text=None, session=session)

        suggestion = result.draft.suggested_skills[0]
        assert suggestion.catalog_status == "existing"
        assert suggestion.catalog_skill_name == "Atendimento ao cliente"

    @pytest.mark.asyncio
    async def test_marks_suggested_skill_as_existing_when_alias_matches_catalog(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        ai_payload = {
            **_DRAFT_JSON,
            "suggested_skills": [
                {
                    "name": "ERP Protheus",
                    "category": "tool",
                    "aliases": ["TOTVS Protheus"],
                    "description": None,
                    "importance": "differential",
                    "source": "ai_suggested",
                }
            ],
        }
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=_mock_ai(_ai_response(content=json.dumps(ai_payload))),
            ),
            patch(
                "src.application.services.job_ai_draft_service.SQLAlchemySkillCatalogRepository.list_runtime_skills",
                new=AsyncMock(
                    return_value=[_catalog_skill("Suporte Protheus", aliases=["TOTVS Protheus"])]
                ),
            ),
        ):
            result = await svc.generate(text_input="TOTVS Protheus", ocr_text=None, session=session)

        suggestion = result.draft.suggested_skills[0]
        assert suggestion.catalog_status == "existing"
        assert suggestion.catalog_skill_name == "Suporte Protheus"

    @pytest.mark.asyncio
    async def test_marks_suggested_skill_as_new_when_catalog_has_no_match(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        ai_payload = {
            **_DRAFT_JSON,
            "suggested_skills": [
                {
                    "name": "Suporte TOTVS",
                    "category": "tool",
                    "aliases": ["Suporte ERP"],
                    "description": None,
                    "importance": "differential",
                    "source": "ai_suggested",
                }
            ],
        }
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=_mock_ai(_ai_response(content=json.dumps(ai_payload))),
            ),
            patch(
                "src.application.services.job_ai_draft_service.SQLAlchemySkillCatalogRepository.list_runtime_skills",
                new=AsyncMock(return_value=[]),
            ),
        ):
            result = await svc.generate(text_input="Suporte TOTVS", ocr_text=None, session=session)

        assert result.draft.suggested_skills[0].catalog_status == "new"

    @pytest.mark.asyncio
    async def test_marks_suggested_skill_as_conflict_when_aliases_match_multiple_catalog_skills(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        ai_payload = {
            **_DRAFT_JSON,
            "suggested_skills": [
                {
                    "name": "Suporte ERP",
                    "category": "business_process",
                    "aliases": ["Suporte TOTVS", "ERP Protheus"],
                    "description": None,
                    "importance": "competency",
                    "source": "ai_suggested",
                }
            ],
        }
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=_mock_ai(_ai_response(content=json.dumps(ai_payload))),
            ),
            patch(
                "src.application.services.job_ai_draft_service.SQLAlchemySkillCatalogRepository.list_runtime_skills",
                new=AsyncMock(
                    return_value=[
                        _catalog_skill("Suporte Protheus", aliases=["Suporte TOTVS"]),
                        _catalog_skill("ERP Corporativo", aliases=["ERP Protheus"]),
                    ]
                ),
            ),
        ):
            result = await svc.generate(text_input="Suporte ERP", ocr_text=None, session=session)

        suggestion = result.draft.suggested_skills[0]
        assert suggestion.catalog_status == "conflict"
        assert set(suggestion.catalog_conflicts) == {"Suporte Protheus", "ERP Corporativo"}


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
                text_input="Vaga completa para Operador de Caixa em São Paulo, SP, escala 6x1 e modelo presencial",
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
                text_input="Vaga para caixa",
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
    async def test_persist_usage_log_called_with_failed_on_ai_error(self) -> None:
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
        mock_log.assert_called_once()
        payload = mock_log.call_args[0][1]
        assert payload.status == "error"
        assert payload.error_message == "usage_unavailable"
        assert payload.input_tokens == 0
        assert payload.output_tokens == 0

    @pytest.mark.asyncio
    async def test_persist_usage_log_called_with_failed_on_parse_error(self) -> None:
        svc = JobAiDraftService()
        session = _mock_session()
        bad_ai = _mock_ai(_ai_response(content="not valid json at all !!", input_tokens=100, output_tokens=50))
        with (
            patch(
                "src.application.services.job_ai_draft_service.AIServiceFactory.create",
                return_value=bad_ai,
            ),
            patch(
                "src.application.services.job_ai_draft_service.persist_ai_usage_log",
                new_callable=AsyncMock,
            ) as mock_log,
            pytest.raises(AiDraftParseError),
        ):
            await svc.generate(
                text_input="Operador de Caixa",
                ocr_text=None,
                session=session,
            )
        mock_log.assert_called_once()
        payload = mock_log.call_args[0][1]
        assert payload.status == "error"
        assert payload.error_message == "json_parse_error"
        assert payload.input_tokens == 100
        assert payload.output_tokens == 50


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
        assert "discriminatory_requirement_removed" in result.warnings
        assert "safety_check" in result.needs_review
        assert result.safety_check is not None
        assert result.safety_check.highest_severity == "high"

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
        assert result.draft.description is None
        assert "discriminatory_text_removed" in result.warnings
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
                text_input="Vaga para atendimento em loja",
                ocr_text=None,
                session=session,
            )
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None
        assert "salary_removed_no_source_evidence" in result.warnings
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


# ── Salary and benefits evidence guardrails ───────────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestSalaryBenefitsEvidenceGuardrails:
    @pytest.mark.asyncio
    async def test_salary_removed_when_only_schedule_hours_experience_and_openings(self) -> None:
        draft_salary = dict(_DRAFT_JSON, salary_min=2800, salary_max=3200)
        result = await self._generate_with_draft(
            draft_salary,
            "Vendedor escala 6x1, 44h semanais, 2 anos de experiência, 3 vagas, turno de 8 horas.",
        )
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None
        assert "salary_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_salary_preserved_with_explicit_salary_amount(self) -> None:
        draft_salary = dict(_DRAFT_JSON, salary_min=3000, salary_max=3000)
        result = await self._generate_with_draft(draft_salary, "Vendedor com salário R$ 3000.")
        assert result.draft.salary_min == 3000
        assert result.draft.salary_max == 3000
        assert "salary_removed_no_source_evidence" not in result.warnings

    @pytest.mark.asyncio
    async def test_salary_preserved_with_salary_range(self) -> None:
        draft_salary = dict(_DRAFT_JSON, salary_min=2500, salary_max=3500)
        result = await self._generate_with_draft(
            draft_salary,
            "Vaga com faixa salarial de R$ 2500 a R$ 3500.",
        )
        assert result.draft.salary_min == 2500
        assert result.draft.salary_max == 3500

    @pytest.mark.asyncio
    async def test_salary_removed_from_common_role_without_salary_evidence(self) -> None:
        draft_salary = dict(_DRAFT_JSON, salary_min=2500, salary_max=3500)
        result = await self._generate_with_draft(draft_salary, "Vaga para vendedor em loja de varejo.")
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None

    @pytest.mark.asyncio
    async def test_salary_preserved_with_monthly_compensation(self) -> None:
        draft_salary = dict(_DRAFT_JSON, salary_min=4000, salary_max=4000)
        result = await self._generate_with_draft(draft_salary, "Remuneração mensal 4000.")
        assert result.draft.salary_min == 4000
        assert result.draft.salary_max == 4000

    @pytest.mark.asyncio
    async def test_single_benefit_removed_without_source_evidence(self) -> None:
        draft_benefits = dict(_DRAFT_JSON, benefits=["Vale-transporte"])
        result = await self._generate_with_draft(draft_benefits, "Vaga para vendedor.")
        assert result.draft.benefits == []
        assert "benefit_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_multiple_benefits_removed_without_source_evidence(self) -> None:
        draft_benefits = dict(_DRAFT_JSON, benefits=["Vale-transporte", "Plano de saúde", "Bônus"])
        result = await self._generate_with_draft(draft_benefits, "Vaga para vendedor.")
        assert result.draft.benefits == []
        assert result.warnings.count("benefit_removed_no_source_evidence") == 1

    @pytest.mark.asyncio
    async def test_only_transport_voucher_preserved_when_explicit(self) -> None:
        draft_benefits = dict(_DRAFT_JSON, benefits=["Vale-transporte"])
        result = await self._generate_with_draft(draft_benefits, "Benefícios: vale transporte.")
        assert result.draft.benefits == ["Vale-transporte"]
        assert "benefit_removed_no_source_evidence" not in result.warnings

    @pytest.mark.asyncio
    async def test_only_health_plan_preserved_when_explicit(self) -> None:
        draft_benefits = dict(_DRAFT_JSON, benefits=["Plano de saúde"])
        result = await self._generate_with_draft(draft_benefits, "Benefícios: plano de saúde.")
        assert result.draft.benefits == ["Plano de saúde"]

    @pytest.mark.asyncio
    async def test_keeps_only_benefits_with_item_level_source_evidence(self) -> None:
        draft_benefits = dict(_DRAFT_JSON, benefits=["Vale-transporte", "Plano de saúde"])
        result = await self._generate_with_draft(draft_benefits, "Benefícios: vale transporte.")
        assert result.draft.benefits == ["Vale-transporte"]
        assert "benefit_removed_no_source_evidence" in result.warnings

    def test_missing_benefits_is_not_quality_penalty_or_warning(self) -> None:
        with_benefits = _parse_draft(dict(_DRAFT_JSON, benefits=["Vale-transporte"]))
        without_benefits = _parse_draft(dict(_DRAFT_JSON, benefits=[]))
        with_score, with_missing = evaluate_quality(with_benefits)
        without_score, without_missing = evaluate_quality(without_benefits)
        assert "missing_benefits" not in with_missing
        assert "missing_benefits" not in without_missing
        assert without_score == with_score

    def test_backend_warnings_contract_stays_plain_string_list(self) -> None:
        draft = _parse_draft(dict(_DRAFT_JSON, salary_min=3000, benefits=["Vale-transporte"]))
        _, warnings, _ = _post_validate(draft, "Vaga para vendedor.")
        assert "salary_removed_no_source_evidence" in warnings
        assert "benefit_removed_no_source_evidence" in warnings
        assert all(isinstance(warning, str) for warning in warnings)

    async def _generate_with_draft(self, draft_payload: dict, text_input: str):
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_payload))),
        ):
            return await svc.generate(text_input=text_input, ocr_text=None, session=session)


# ── Experience and education evidence guardrails ──────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestExperienceEducationEvidenceGuardrails:
    @pytest.mark.asyncio
    async def test_preserves_two_years_experience_when_explicit(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_years_experience=2)
        result = await self._generate_with_draft(draft, "Necessário 2 anos de experiência.")
        assert result.draft.minimum_years_experience == 2

    @pytest.mark.asyncio
    async def test_preserves_minimum_one_year_when_explicit(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_years_experience=1)
        result = await self._generate_with_draft(draft, "Requisito: mínimo 1 ano na função.")
        assert result.draft.minimum_years_experience == 1

    @pytest.mark.asyncio
    async def test_converts_six_months_experience_to_half_year(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_years_experience=1)
        result = await self._generate_with_draft(
            draft,
            "Experiência mínima de 6 meses em atendimento.",
        )
        assert result.draft.minimum_years_experience == 0.5

    @pytest.mark.asyncio
    async def test_senior_without_years_does_not_preserve_minimum_years(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_years_experience=5, seniority="senior")
        result = await self._generate_with_draft(draft, "Vaga para profissional sênior.")
        assert result.draft.minimum_years_experience is None
        assert "minimum_years_experience_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_openings_count_does_not_preserve_minimum_years(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_years_experience=3)
        result = await self._generate_with_draft(draft, "Vaga para vendedor, 3 vagas disponíveis.")
        assert result.draft.minimum_years_experience is None

    @pytest.mark.asyncio
    async def test_ai_years_without_evidence_are_removed_with_warning(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_years_experience=2)
        result = await self._generate_with_draft(draft, "Vaga para vendedor com vivência em loja.")
        assert result.draft.minimum_years_experience is None
        assert "minimum_years_experience_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_preserves_high_school_when_explicit(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_education_level="high_school")
        result = await self._generate_with_draft(draft, "Requisito: ensino médio completo.")
        assert result.draft.minimum_education_level == "high_school"

    @pytest.mark.asyncio
    async def test_preserves_bachelor_when_explicit(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_education_level="bachelor")
        result = await self._generate_with_draft(draft, "Requisito: superior completo.")
        assert result.draft.minimum_education_level == "bachelor"

    @pytest.mark.asyncio
    async def test_ai_education_without_evidence_is_removed_with_warning(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_education_level="superior completo")
        result = await self._generate_with_draft(draft, "Vaga para analista administrativo.")
        assert result.draft.minimum_education_level is None
        assert "minimum_education_level_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_preserves_experience_context_when_explicit(self) -> None:
        draft = dict(_DRAFT_JSON, experience_context="experiência com atendimento ao cliente")
        result = await self._generate_with_draft(
            draft,
            "Requisito: experiência com atendimento ao cliente.",
        )
        assert result.draft.experience_context == "experiência com atendimento ao cliente"

    @pytest.mark.asyncio
    async def test_reduces_invented_experience_context_to_source_evidence(self) -> None:
        draft = dict(_DRAFT_JSON, experience_context="experiência com vendas externas")
        result = await self._generate_with_draft(
            draft,
            "Requisito: experiência com atendimento ao cliente.",
        )
        assert result.draft.experience_context == "experiência com atendimento ao cliente"

    @pytest.mark.asyncio
    async def test_backfills_experience_context_from_administrative_routines_when_ai_omits_it(self) -> None:
        draft = dict(_DRAFT_JSON, experience_context=None)
        result = await self._generate_with_draft(
            draft,
            (
                "Vai ajudar com lançamentos, conferência de documentos, atendimento interno, "
                "planilhas e organização de arquivos."
            ),
        )
        assert result.draft.experience_context == (
            "Rotinas com Atendimento interno, Conferência de documentos, "
            "Lançamentos, Planilhas, Organização de arquivos."
        )
        assert "experience_context_backfilled_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_regression_salary_without_evidence_still_removed(self) -> None:
        draft = dict(_DRAFT_JSON, salary_min=3000, salary_max=3500)
        result = await self._generate_with_draft(draft, "Vaga para vendedor com escala 6x1.")
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None
        assert "salary_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_regression_benefit_without_evidence_still_removed(self) -> None:
        draft = dict(_DRAFT_JSON, benefits=["Vale-transporte"])
        result = await self._generate_with_draft(draft, "Vaga para vendedor.")
        assert result.draft.benefits == []
        assert "benefit_removed_no_source_evidence" in result.warnings

    async def _generate_with_draft(self, draft_payload: dict, text_input: str):
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_payload))),
        ):
            return await svc.generate(text_input=text_input, ocr_text=None, session=session)


# ── Selection flow and boolean evidence guardrails ────────────────────────────

@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestSelectionFlowBooleanGuardrails:
    @pytest.mark.asyncio
    async def test_json_without_requires_manager_review_does_not_activate_manager_review(self) -> None:
        draft = dict(_DRAFT_JSON)
        draft.pop("requires_manager_review")
        result = await self._generate_with_draft(draft, "Vaga para vendedor.")
        assert result.draft.requires_manager_review is None

    @pytest.mark.asyncio
    async def test_manager_review_true_without_evidence_is_removed(self) -> None:
        draft = dict(_DRAFT_JSON, requires_manager_review=True)
        result = await self._generate_with_draft(draft, "Vaga para analista administrativo.")
        assert result.draft.requires_manager_review is None
        assert "requires_manager_review_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_manager_review_true_preserved_with_entrevista_com_gestor(self) -> None:
        draft = dict(_DRAFT_JSON, requires_manager_review=True)
        result = await self._generate_with_draft(
            draft,
            "Processo com entrevista com gestor após a triagem inicial.",
        )
        assert result.draft.requires_manager_review is True
        assert "requires_manager_review_preserved_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_manager_review_true_preserved_with_aprovacao_gerencial(self) -> None:
        draft = dict(_DRAFT_JSON, requires_manager_review=True)
        result = await self._generate_with_draft(
            draft,
            "A contratação depende de aprovação gerencial ao final do processo.",
        )
        assert result.draft.requires_manager_review is True
        assert "requires_manager_review_preserved_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_json_without_behavioral_assessment_does_not_activate_behavioral_assessment(self) -> None:
        draft = dict(_DRAFT_JSON)
        draft.pop("requires_behavioral_assessment")
        result = await self._generate_with_draft(draft, "Vaga para vendedor.")
        assert result.draft.requires_behavioral_assessment is None

    @pytest.mark.asyncio
    async def test_behavioral_assessment_true_without_evidence_is_removed(self) -> None:
        draft = dict(_DRAFT_JSON, requires_behavioral_assessment=True)
        result = await self._generate_with_draft(draft, "Vaga com boa comunicação e trabalho em equipe.")
        assert result.draft.requires_behavioral_assessment is None
        assert "requires_behavioral_assessment_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_behavioral_assessment_true_preserved_with_avaliacao_comportamental(self) -> None:
        draft = dict(_DRAFT_JSON, requires_behavioral_assessment=True)
        result = await self._generate_with_draft(
            draft,
            "Etapa obrigatória com avaliação comportamental antes da entrevista final.",
        )
        assert result.draft.requires_behavioral_assessment is True
        assert "requires_behavioral_assessment_preserved_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_behavioral_assessment_true_preserved_with_disc(self) -> None:
        draft = dict(_DRAFT_JSON, requires_behavioral_assessment=True)
        result = await self._generate_with_draft(
            draft,
            "O processo inclui DISC e entrevista final com RH.",
        )
        assert result.draft.requires_behavioral_assessment is True
        assert "requires_behavioral_assessment_preserved_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_selection_flow_type_without_evidence_is_cleared(self) -> None:
        draft = dict(_DRAFT_JSON, selection_flow_type="technical")
        result = await self._generate_with_draft(draft, "Vaga para desenvolvedor sênior.")
        assert result.draft.selection_flow_type is None
        assert "selection_flow_type_requires_manual_review" not in result.warnings

    @pytest.mark.asyncio
    async def test_generic_processo_seletivo_completo_does_not_generate_selection_flow_type(self) -> None:
        draft = dict(_DRAFT_JSON, selection_flow_type="standard")
        result = await self._generate_with_draft(draft, "A empresa oferece processo seletivo completo.")
        assert result.draft.selection_flow_type is None
        assert "selection_flow_type_requires_manual_review" not in result.warnings

    @pytest.mark.asyncio
    async def test_explicit_selection_flow_requires_manual_review_instead_of_inventing(self) -> None:
        draft = dict(_DRAFT_JSON, selection_flow_type="technical")
        result = await self._generate_with_draft(
            draft,
            "Processo com triagem e entrevista, seguido de prova técnica.",
        )
        assert result.draft.selection_flow_type is None
        assert "selection_flow_type_requires_manual_review" in result.warnings

    @pytest.mark.asyncio
    async def test_regression_salary_without_evidence_still_removed(self) -> None:
        draft = dict(_DRAFT_JSON, salary_min=2800, salary_max=3200)
        result = await self._generate_with_draft(draft, "Vaga para vendedor em loja.")
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None
        assert "salary_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_regression_benefits_without_evidence_still_removed(self) -> None:
        draft = dict(_DRAFT_JSON, benefits=["Vale-transporte"])
        result = await self._generate_with_draft(draft, "Vaga para vendedor.")
        assert result.draft.benefits == []
        assert "benefit_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_regression_experience_and_education_without_evidence_still_removed(self) -> None:
        draft = dict(
            _DRAFT_JSON,
            minimum_years_experience=3,
            minimum_education_level="bachelor",
        )
        result = await self._generate_with_draft(draft, "Vaga para analista pleno.")
        assert result.draft.minimum_years_experience is None
        assert result.draft.minimum_education_level is None
        assert "minimum_years_experience_removed_no_source_evidence" in result.warnings
        assert "minimum_education_level_removed_no_source_evidence" in result.warnings

    async def _generate_with_draft(self, draft_payload: dict, text_input: str):
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_payload))),
        ):
            return await svc.generate(text_input=text_input, ocr_text=None, session=session)


@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestFillBackfillGuardrails:
    ADMIN_TEXT = (
        "Criar vaga para Assistente Administrativo.\n\n"
        "Vai ajudar com lançamentos, conferência de documentos, atendimento interno, "
        "planilhas e organização de arquivos.\n\n"
        "Precisa ter conhecimento em Excel, boa comunicação e organização.\n\n"
        "Escala 6x1, 44 horas semanais, 3 vagas disponíveis.\n"
        "Preferência por pessoa jovem, boa aparência e que more perto da empresa.\n\n"
        "Não informar salário.\n"
        "Não informar benefícios."
    )

    def test_extract_requirements_returns_expected_administrative_items(self) -> None:
        assert extract_requirements(self.ADMIN_TEXT) == [
            "Excel",
            "Boa comunicação",
            "Organização",
            "Atendimento interno",
            "Conferência de documentos",
            "Lançamentos",
            "Planilhas",
            "Organização de arquivos",
        ]

    def test_extract_work_model_requires_explicit_evidence(self) -> None:
        assert extract_work_model("Escala 6x1, 44 horas semanais.") is None
        assert extract_work_model("Modelo de trabalho híbrido com 2 dias presenciais.") == "hybrid"
        assert extract_work_model("Vaga 100% remota.") == "remote"
        assert extract_work_model("Atuação presencial na unidade central.") == "onsite"

    @pytest.mark.asyncio
    async def test_backfills_requirements_when_ai_returns_empty(self) -> None:
        draft = dict(_DRAFT_JSON, requirements=[])
        result = await self._generate_with_draft(draft, self.ADMIN_TEXT)
        assert result.draft.requirements == [
            "Excel",
            "Boa comunicação",
            "Organização",
            "Atendimento interno",
            "Conferência de documentos",
            "Lançamentos",
            "Planilhas",
            "Organização de arquivos",
        ]
        assert "requirements_backfilled_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_backfills_experience_context_when_ai_returns_null(self) -> None:
        draft = dict(_DRAFT_JSON, experience_context=None)
        result = await self._generate_with_draft(draft, self.ADMIN_TEXT)
        assert result.draft.experience_context == (
            "Rotinas com Atendimento interno, Conferência de documentos, "
            "Lançamentos, Planilhas, Organização de arquivos."
        )
        assert "experience_context_backfilled_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_removes_work_model_without_explicit_source_evidence(self) -> None:
        draft = dict(_DRAFT_JSON, work_model="onsite")
        result = await self._generate_with_draft(draft, self.ADMIN_TEXT)
        assert result.draft.work_model is None
        assert "work_model_removed_no_source_evidence" in result.warnings

    @pytest.mark.asyncio
    async def test_backfills_work_model_when_source_is_explicit_and_ai_omits_it(self) -> None:
        draft = dict(_DRAFT_JSON, work_model=None)
        result = await self._generate_with_draft(
            draft,
            "Vaga para assistente administrativo em modelo híbrido com escala 6x1.",
        )
        assert result.draft.work_model == "hybrid"
        assert "work_model_backfilled_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_residence_restriction_does_not_fill_location(self) -> None:
        draft = dict(_DRAFT_JSON, unit="Perto da empresa")
        result = await self._generate_with_draft(draft, self.ADMIN_TEXT)
        assert result.draft.unit is None
        assert result.safety_check is not None
        assert any(f.field == "unit" for f in result.safety_check.findings)

    @pytest.mark.asyncio
    async def test_admin_text_keeps_salary_and_benefits_removed(self) -> None:
        draft = dict(_DRAFT_JSON, salary_min=2500, salary_max=3000, benefits=["Vale-transporte"])
        result = await self._generate_with_draft(draft, self.ADMIN_TEXT)
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None
        assert result.draft.benefits == []

    async def _generate_with_draft(self, draft_payload: dict, text_input: str):
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_payload))),
        ):
            return await svc.generate(text_input=text_input, ocr_text=None, session=session)


@pytest.mark.unit
@patch("src.application.services.job_ai_draft_service.settings.JOB_AI_DRAFT_USE_LANGGRAPH", False)
class TestDiscriminationSafetyCheckGuardrails:
    @pytest.mark.asyncio
    async def test_description_with_age_requirement_is_removed_and_marked_for_review(self) -> None:
        draft = dict(_DRAFT_JSON, description="Buscamos profissional até 30 anos para a vaga.")
        result = await self._generate_with_draft(draft, "Vaga para atendimento.")
        assert result.draft.description is None
        assert "discriminatory_text_removed" in result.warnings
        assert "safety_check" in result.needs_review
        assert result.safety_check is not None
        assert result.safety_check.highest_severity == "high"

    @pytest.mark.asyncio
    async def test_title_with_vaga_para_jovem_generates_manual_review(self) -> None:
        draft = dict(_DRAFT_JSON, title="Vaga para jovem")
        result = await self._generate_with_draft(draft, "Vaga para atendimento.")
        assert result.draft.title is None
        assert "job_title_requires_manual_review" in result.warnings
        assert result.safety_check is not None
        assert any(f.field == "title" for f in result.safety_check.findings)

    @pytest.mark.asyncio
    async def test_requirement_boa_aparencia_is_removed(self) -> None:
        draft = dict(_DRAFT_JSON, requirements=["Ensino médio completo", "Boa aparência"])
        result = await self._generate_with_draft(draft, "Vaga para atendimento.")
        assert result.draft.requirements == ["Ensino médio completo"]
        assert "discriminatory_requirement_removed" in result.warnings

    @pytest.mark.asyncio
    async def test_screening_question_with_age_is_removed(self) -> None:
        draft = dict(
            _DRAFT_JSON,
            screening_questions=["Você tem até 30 anos?", "Tem disponibilidade para turno integral?"],
        )
        result = await self._generate_with_draft(draft, "Vaga para atendimento.")
        assert result.draft.screening_questions == ["Tem disponibilidade para turno integral?"]
        assert "discriminatory_screening_question_removed" in result.warnings

    @pytest.mark.asyncio
    async def test_screening_question_with_family_status_is_removed(self) -> None:
        draft = dict(
            _DRAFT_JSON,
            screening_questions=["Você tem filhos?", "Tem disponibilidade para turno integral?"],
        )
        result = await self._generate_with_draft(draft, "Vaga para atendimento.")
        assert result.draft.screening_questions == ["Tem disponibilidade para turno integral?"]
        assert "discriminatory_screening_question_removed" in result.warnings

    @pytest.mark.asyncio
    async def test_perfil_feminino_is_removed_or_blocked(self) -> None:
        draft = dict(_DRAFT_JSON, description="Buscamos perfil feminino para recepção.")
        result = await self._generate_with_draft(draft, "Vaga para recepção.")
        assert result.draft.description is None
        assert result.safety_check is not None
        assert any(f.code == "discriminatory_gender_requirement" for f in result.safety_check.findings)

    @pytest.mark.asyncio
    async def test_sem_deficiencia_is_removed_or_blocked(self) -> None:
        draft = dict(_DRAFT_JSON, requirements=["Sem deficiência", "Ensino médio completo"])
        result = await self._generate_with_draft(draft, "Vaga para atendimento.")
        assert result.draft.requirements == ["Ensino médio completo"]
        assert result.safety_check is not None
        assert any(f.code == "discriminatory_health_requirement" for f in result.safety_check.findings)

    @pytest.mark.asyncio
    async def test_morador_de_bairro_restriction_is_removed_or_marked(self) -> None:
        draft = dict(_DRAFT_JSON, description="Somente moradores de bairro X devem se candidatar.")
        result = await self._generate_with_draft(draft, "Vaga para logística.")
        assert result.draft.description is None
        assert result.safety_check is not None
        assert any(f.field == "description" for f in result.safety_check.findings)

    @pytest.mark.asyncio
    async def test_safety_check_highest_severity_is_high_when_high_term_exists(self) -> None:
        draft = dict(_DRAFT_JSON, description="Buscamos profissional até 30 anos.")
        result = await self._generate_with_draft(draft, "Vaga para atendimento.")
        assert result.safety_check is not None
        assert result.safety_check.highest_severity == "high"

    @pytest.mark.asyncio
    async def test_safety_check_findings_contains_affected_field(self) -> None:
        draft = dict(_DRAFT_JSON, experience_context="Experiência com clientes e boa aparência.")
        result = await self._generate_with_draft(draft, "Experiência com atendimento ao cliente.")
        assert result.safety_check is not None
        assert any(f.field == "experience_context" for f in result.safety_check.findings)

    @pytest.mark.asyncio
    async def test_needs_review_contains_safety_check_when_high_finding_exists(self) -> None:
        draft = dict(_DRAFT_JSON, title="Vaga para jovem")
        result = await self._generate_with_draft(draft, "Vaga para atendimento.")
        assert "safety_check" in result.needs_review

    @pytest.mark.asyncio
    async def test_safe_text_does_not_generate_critical_safety_check(self) -> None:
        draft = dict(
            _DRAFT_JSON,
            description="Vaga para atendimento ao cliente em escala 6x1.",
            requirements=["Ensino médio completo"],
            screening_questions=["Tem disponibilidade para turno integral?"],
        )
        result = await self._generate_with_draft(draft, "Vaga para atendimento ao cliente em escala 6x1.")
        assert result.safety_check is None
        assert "safety_check" not in result.needs_review

    @pytest.mark.asyncio
    async def test_differential_source_does_not_turn_protheus_into_mandatory(self) -> None:
        draft = dict(_DRAFT_JSON, mandatory_skills=["Experiência com Protheus"], nice_to_have_skills=[])
        result = await self._generate_with_draft(
            draft,
            "Diferencial: conhecimento em Protheus. Ensino médio completo.",
        )
        assert "Experiência com Protheus" not in result.draft.mandatory_skills
        assert "Experiência com Protheus" in result.draft.nice_to_have_skills
        assert "nice_to_have_preserved_from_source" in result.warnings

    @pytest.mark.asyncio
    async def test_regression_salary_without_evidence_still_removed(self) -> None:
        draft = dict(_DRAFT_JSON, salary_min=3000, salary_max=3500)
        result = await self._generate_with_draft(draft, "Vaga para vendedor.")
        assert result.draft.salary_min is None
        assert result.draft.salary_max is None

    @pytest.mark.asyncio
    async def test_regression_benefit_without_evidence_still_removed(self) -> None:
        draft = dict(_DRAFT_JSON, benefits=["Vale-transporte"])
        result = await self._generate_with_draft(draft, "Vaga para vendedor.")
        assert result.draft.benefits == []

    @pytest.mark.asyncio
    async def test_regression_experience_and_education_without_evidence_still_removed(self) -> None:
        draft = dict(_DRAFT_JSON, minimum_years_experience=2, minimum_education_level="bachelor")
        result = await self._generate_with_draft(draft, "Vaga para vendedor.")
        assert result.draft.minimum_years_experience is None
        assert result.draft.minimum_education_level is None

    @pytest.mark.asyncio
    async def test_regression_booleans_without_evidence_still_removed(self) -> None:
        draft = dict(
            _DRAFT_JSON,
            requires_manager_review=True,
            requires_behavioral_assessment=True,
        )
        result = await self._generate_with_draft(draft, "Vaga para vendedor.")
        assert result.draft.requires_manager_review is None
        assert result.draft.requires_behavioral_assessment is None

    async def _generate_with_draft(self, draft_payload: dict, text_input: str):
        svc = JobAiDraftService()
        session = _mock_session()
        with patch(
            "src.application.services.job_ai_draft_service.AIServiceFactory.create",
            return_value=_mock_ai(_ai_response(json.dumps(draft_payload))),
        ):
            return await svc.generate(text_input=text_input, ocr_text=None, session=session)


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
            "safety_check": None,
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
        """3. Com LangGraph ativo, salary inventado deve ser descartado sem evidência salarial."""
        draft = _parse_draft(_DRAFT_JSON)
        draft.salary_min = 2000.0  # Invented
        state = {
            "draft": draft,
            "combined_text": "Escala 6x1, 44h semanais e 2 anos de experiência."
        }
        
        result_state = await post_validate_node(state, {})
        assert result_state["draft"].salary_min is None
        assert "salary_removed_no_source_evidence" in result_state["warnings"]

    @pytest.mark.asyncio
    async def test_generate_draft_node_logs_failed_on_ai_error(self) -> None:
        from src.ai_orchestration.jobs.job_ai_draft_graph import generate_draft_node
        failing_ai = AsyncMock()
        failing_ai.analyze = AsyncMock(side_effect=RuntimeError("LangGraph boom"))
        session = _mock_session()
        config = {"configurable": {"session": session}}
        state = {"combined_text": "vaga mock"}
        with (
            patch("src.ai_orchestration.jobs.job_ai_draft_graph.AIServiceFactory.create", return_value=failing_ai),
            patch("src.ai_orchestration.jobs.job_ai_draft_graph.persist_ai_usage_log", new_callable=AsyncMock) as mock_log,
            pytest.raises(AiDraftAIError)
        ):
            await generate_draft_node(state, config)
        
        mock_log.assert_called_once()
        payload = mock_log.call_args[0][1]
        assert payload.status == "error"
        assert payload.input_tokens == 0
        assert payload.error_message == "usage_unavailable"

    @pytest.mark.asyncio
    async def test_parse_draft_node_logs_failed_on_parse_error(self) -> None:
        from src.ai_orchestration.jobs.job_ai_draft_graph import parse_draft_node
        session = _mock_session()
        config = {"configurable": {"session": session}}
        usage = MagicMock(provider="google", model="gemini", input_tokens=10, output_tokens=5)
        state = {"raw_content": "bad json", "usage": usage}
        
        with (
            patch("src.ai_orchestration.jobs.job_ai_draft_graph.persist_ai_usage_log", new_callable=AsyncMock) as mock_log,
            pytest.raises(AiDraftParseError)
        ):
            await parse_draft_node(state, config)
            
        mock_log.assert_called_once()
        payload = mock_log.call_args[0][1]
        assert payload.status == "error"
        assert payload.input_tokens == 10
        assert payload.output_tokens == 5
        assert payload.error_message == "json_parse_error"

    @pytest.mark.asyncio
    async def test_post_validate_node_logs_success(self) -> None:
        from src.ai_orchestration.jobs.job_ai_draft_graph import post_validate_node
        session = _mock_session()
        config = {"configurable": {"session": session}}
        usage = MagicMock(provider="google", model="gemini", input_tokens=10, output_tokens=5)
        draft = _parse_draft(_DRAFT_JSON)
        state = {"draft": draft, "combined_text": "test", "usage": usage, "warnings": []}
        
        with patch("src.ai_orchestration.jobs.job_ai_draft_graph.persist_ai_usage_log", new_callable=AsyncMock) as mock_log:
            await post_validate_node(state, config)
            
        mock_log.assert_called_once()
        payload = mock_log.call_args[0][1]
        assert payload.status == "success"
        assert payload.input_tokens == 10
        assert payload.output_tokens == 5

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
        assert "discriminatory_requirement_removed" in result_state["warnings"]
        assert "safety_check" in result_state["needs_review"]
        assert result_state["safety_check"] is not None

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
