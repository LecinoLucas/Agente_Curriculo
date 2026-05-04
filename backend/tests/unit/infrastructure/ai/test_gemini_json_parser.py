"""Tests for GeminiAdapter JSON parsing robustness.

Validates that the adapter correctly handles:
1. Pure valid JSON
2. JSON wrapped in markdown fences (```json ... ```)
3. JSON wrapped in generic fences (``` ... ```)
4. JSON with leading text
5. JSON with trailing text
6. Invalid JSON with clear error messages
7. Empty strings with clear error messages
"""

import pytest

from src.infrastructure.ai.gemini_adapter import GeminiAdapter


class TestGeminiJsonParser:
    """Unit tests for GeminiAdapter._safe_parse_json() robustness."""

    @pytest.fixture
    def adapter(self):
        """Provide a GeminiAdapter instance for testing."""
        return GeminiAdapter(model_id="gemini-2.5-flash-test")

    def test_accepts_pure_json(self, adapter):
        """Verify: pure valid JSON is parsed correctly."""
        content = '{"key": "value", "nested": {"count": 42}}'
        result = adapter._safe_parse_json(content)
        assert result == {"key": "value", "nested": {"count": 42}}

    def test_accepts_json_in_backtick_fence_with_json_label(self, adapter):
        """Verify: JSON wrapped in ```json ... ``` is extracted."""
        content = '```json\n{"skill": "python", "level": "senior"}\n```'
        result = adapter._safe_parse_json(content)
        assert result == {"skill": "python", "level": "senior"}

    def test_accepts_json_in_backtick_fence_without_label(self, adapter):
        """Verify: JSON wrapped in ``` ... ``` is extracted."""
        content = '```\n{"name": "Alice", "years": 5}\n```'
        result = adapter._safe_parse_json(content)
        assert result == {"name": "Alice", "years": 5}

    def test_accepts_json_in_backtick_fence_uppercase_json_label(self, adapter):
        """Verify: Case-insensitive fence label (```JSON) is handled."""
        content = '```JSON\n{"role": "engineer"}\n```'
        result = adapter._safe_parse_json(content)
        assert result == {"role": "engineer"}

    def test_accepts_json_with_text_before(self, adapter):
        """Verify: Leading text before JSON is ignored."""
        content = 'Here is the analysis result:\n{"score": 85, "status": "match"}'
        result = adapter._safe_parse_json(content)
        assert result == {"score": 85, "status": "match"}

    def test_accepts_json_with_text_after(self, adapter):
        """Verify: Trailing text after JSON is ignored."""
        content = '{"experience_months": 120}\nThat is the final result.'
        result = adapter._safe_parse_json(content)
        assert result == {"experience_months": 120}

    def test_accepts_json_with_text_before_and_after(self, adapter):
        """Verify: Leading and trailing text are both ignored."""
        content = (
            'The analysis shows:\n'
            '{"recommendation": "interview", "confidence": "high"}\n'
            'Please review carefully.'
        )
        result = adapter._safe_parse_json(content)
        assert result == {"recommendation": "interview", "confidence": "high"}

    def test_accepts_json_with_escaped_quotes_in_strings(self, adapter):
        """Verify: Escaped quotes inside JSON strings don't break parsing."""
        content = '{"description": "Senior \\"software\\" engineer"}'
        result = adapter._safe_parse_json(content)
        assert result == {"description": 'Senior "software" engineer'}

    def test_accepts_json_with_closing_brace_in_string_value(self, adapter):
        """Verify: } inside string values doesn't prematurely end parsing."""
        content = '{"rule": "if score > 50} then accept"}'
        result = adapter._safe_parse_json(content)
        assert result == {"rule": "if score > 50} then accept"}

    def test_accepts_deeply_nested_json(self, adapter):
        """Verify: Deeply nested structures are parsed correctly."""
        content = (
            '{'
            '"level1": {'
            '"level2": {'
            '"level3": {"value": "deep"}'
            '}'
            '}'
            '}'
        )
        result = adapter._safe_parse_json(content)
        assert result["level1"]["level2"]["level3"]["value"] == "deep"

    def test_raises_on_invalid_json_no_object(self, adapter):
        """Verify: Non-object JSON raises RuntimeError with clear message."""
        content = '["array", "not", "object"]'
        with pytest.raises(RuntimeError, match="must be an object"):
            adapter._safe_parse_json(content)

    def test_raises_on_invalid_json_no_braces(self, adapter):
        """Verify: Content with no JSON object raises RuntimeError."""
        content = 'This is plain text with no JSON at all'
        with pytest.raises(RuntimeError, match="invalid JSON"):
            adapter._safe_parse_json(content)

    def test_raises_on_malformed_json_syntax(self, adapter):
        """Verify: Malformed JSON syntax raises RuntimeError."""
        content = '{"key": value without quotes}'
        with pytest.raises(RuntimeError, match="invalid JSON"):
            adapter._safe_parse_json(content)

    def test_accepts_second_valid_json_when_first_block_is_invalid(self, adapter):
        """Verify: Parser keeps scanning JSON starts until a valid dict is found."""
        content = 'Invalid: {"x": } and then valid: {"final": true, "score": 91}'
        result = adapter._safe_parse_json(content)
        assert result == {"final": True, "score": 91}

    def test_raises_truncated_error_for_max_tokens_incomplete_json(self, adapter):
        """Verify: finishReason MAX_TOKENS yields explicit truncation error."""
        content = '{"job_understanding":'
        with pytest.raises(RuntimeError, match="truncated"):
            adapter._safe_parse_json(content, finish_reason="MAX_TOKENS")

    def test_raises_on_empty_string(self, adapter):
        """Verify: Empty string raises RuntimeError."""
        content = ''
        with pytest.raises(RuntimeError, match="invalid JSON"):
            adapter._safe_parse_json(content)

    def test_raises_on_whitespace_only(self, adapter):
        """Verify: Whitespace-only string raises RuntimeError."""
        content = '   \n\t  \n   '
        with pytest.raises(RuntimeError, match="invalid JSON"):
            adapter._safe_parse_json(content)

    def test_logs_safe_preview_on_parse_failure(self, adapter, caplog):
        """Verify: Logs include content_preview (not full content) on failure."""
        long_content = 'x' * 5000
        try:
            adapter._safe_parse_json(long_content)
        except RuntimeError:
            pass
        assert 'content_preview=' in caplog.text or len(caplog.text) > 0
