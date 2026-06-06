import pytest

from src.ai_orchestration.assistant.intent_catalog import INTENT_TO_TOOL, DEFAULT_CATALOG
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.ai_orchestration.rag.schemas import RagAnswer, RagSource
from src.ai_orchestration.tools.registry import DEFAULT_REGISTRY


@pytest.fixture
def mock_context() -> AgentContext:
    return AgentContext(
        user_id="user-123",
        role="recruiter",
        permissions=["can_view_jobs", "can_view_candidates"],
        request_id="req-123",
        session_id="sess-123",
    )


class TestToolPermissionGuard:
    def test_guard_allows_existing_permission(self, mock_context: AgentContext) -> None:
        result = ToolPermissionGuard.check(mock_context, "can_view_jobs")
        assert result.allowed is True
        assert result.reason is None

    def test_guard_blocks_missing_permission(self, mock_context: AgentContext) -> None:
        result = ToolPermissionGuard.check(mock_context, "can_manage_admissions")
        assert result.allowed is False
        assert "não encontrada para o role" in str(result.reason)

    def test_guard_enforce_returns_none_if_allowed(self, mock_context: AgentContext) -> None:
        error_result = ToolPermissionGuard.enforce(mock_context, "can_view_candidates")
        assert error_result is None

    def test_guard_enforce_returns_tool_result_if_blocked(self, mock_context: AgentContext) -> None:
        error_result = ToolPermissionGuard.enforce(mock_context, "can_manage_admissions")
        assert isinstance(error_result, ToolResult)
        assert error_result.ok is False
        assert error_result.error_code == "PERMISSION_DENIED"


class TestToolResult:
    def test_pending_approval_creates_correct_result(self) -> None:
        result = ToolResult.pending_approval(
            action="reject_candidate",
            reason="Candidato não possui experiência mínima",
            context={"candidate_id": "123"}
        )
        assert result.ok is True  # Registration of intent was OK
        assert result.requires_approval is True
        assert result.approval_reason == "Candidato não possui experiência mínima"
        assert result.data == {"action": "reject_candidate", "context": {"candidate_id": "123"}}


class TestRagSchemas:
    def test_rag_answer_computes_confidence_automatically(self) -> None:
        source1 = RagSource(
            document_id="doc1",
            title="Title",
            chunk_id="chunk1",
            source_type="rh_policy",
            score=0.9
        )
        source2 = RagSource(
            document_id="doc2",
            title="Title",
            chunk_id="chunk2",
            source_type="rh_policy",
            score=0.7
        )
        answer = RagAnswer(answer="Text", sources=[source1, source2])
        assert answer.confidence == 0.8
        assert answer.has_sources is True
        assert answer.top_source == source1

    def test_rag_answer_adds_low_confidence_warning(self) -> None:
        source = RagSource(
            document_id="doc1",
            title="Title",
            chunk_id="chunk1",
            source_type="rh_policy",
            score=0.4
        )
        answer = RagAnswer(answer="Text", sources=[source])
        assert answer.confidence == 0.4
        assert "low_confidence" in answer.warnings


class TestIntentCatalogRegistryConsistency:
    """Garante que IntentCatalog e DEFAULT_REGISTRY são consistentes."""

    def test_all_catalog_intents_map_to_existing_registry_tools(self) -> None:
        for intent, tool_name in INTENT_TO_TOOL.items():
            assert tool_name in DEFAULT_REGISTRY, (
                f"Intent '{intent}' → '{tool_name}' não existe no DEFAULT_REGISTRY"
            )

    def test_no_catalog_intent_points_to_empty_tool_name(self) -> None:
        for intent, tool_name in INTENT_TO_TOOL.items():
            assert tool_name, f"Intent '{intent}' aponta para tool_name vazio"

    def test_default_catalog_covers_all_five_domains(self) -> None:
        domains = set(DEFAULT_CATALOG.list_domains())
        required = {"job", "candidate", "pipeline", "admission", "protheus"}
        missing = required - domains
        assert not missing, f"Domínios ausentes no IntentCatalog: {missing}"

    def test_intent_count_matches_registry_unique_tools_referenced(self) -> None:
        referenced_tools = set(INTENT_TO_TOOL.values())
        for tool_name in referenced_tools:
            assert tool_name in DEFAULT_REGISTRY, (
                f"Tool '{tool_name}' referenciada pelo catalog mas ausente no registry"
            )
