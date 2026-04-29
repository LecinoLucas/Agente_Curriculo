"""Tests for data quality classifier."""

import pytest
from src.domain.services.data_quality_classifier import DataQualityClassifier
from src.domain.enums.data_quality_status import DataQualityStatus


class TestNoResumeClassification:
    """Test classification when candidate has no resume."""

    def test_no_resume_returns_no_resume_status(self):
        """Candidate with no resume should be marked as NO_RESUME."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=False,
        )
        assert result.status == DataQualityStatus.NO_RESUME
        assert "no resume" in result.reason.lower()

    def test_no_resume_ignores_other_params(self):
        """NO_RESUME status takes precedence regardless of other params."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=False,
            resume_text="Some text",
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.NO_RESUME


class TestParsingFailedClassification:
    """Test classification when resume parsing failed."""

    def test_parsing_failed_returns_parsing_failed_status(self):
        """Resume with failed parsing should be marked as PARSING_FAILED."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_parsed_successfully=False,
        )
        assert result.status == DataQualityStatus.PARSING_FAILED
        assert "parsing" in result.reason.lower()

    def test_parsing_failed_with_text_still_marks_failed(self):
        """If parsing_successfully is explicitly False, PARSING_FAILED takes precedence."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text="Some content",
            resume_parsed_successfully=False,
        )
        assert result.status == DataQualityStatus.PARSING_FAILED


class TestEmptyResumeClassification:
    """Test classification when resume has no content."""

    def test_empty_text_returns_empty_resume_status(self):
        """Resume with no text should be marked as EMPTY_RESUME."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text="",
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.EMPTY_RESUME

    def test_whitespace_only_returns_empty_resume_status(self):
        """Resume with only whitespace should be marked as EMPTY_RESUME."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text="   \n\t  ",
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.EMPTY_RESUME

    def test_very_short_text_returns_empty_resume_status(self):
        """Resume with too short text (< 50 chars) should be marked as EMPTY_RESUME."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text="Short",
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.EMPTY_RESUME

    def test_none_text_returns_empty_resume_status(self):
        """Resume with None text should be marked as EMPTY_RESUME."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text=None,
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.EMPTY_RESUME


class TestValidResumeClassification:
    """Test classification for valid resumes."""

    def test_valid_resume_with_sufficient_content(self):
        """Resume with sufficient content (50+ chars) should be marked as VALID."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text="This is a valid resume with sufficient content that should be marked as valid",
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.VALID
        assert "sufficient" in result.reason.lower()

    def test_valid_resume_with_long_content(self):
        """Resume with long content should be marked as VALID."""
        long_text = "Resume content. " * 50  # 800+ chars
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text=long_text,
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.VALID

    def test_exact_50_char_boundary(self):
        """Resume with exactly 50 chars should be valid."""
        text_50 = "a" * 50
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text=text_50,
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.VALID

    def test_49_char_boundary_is_invalid(self):
        """Resume with 49 chars should be EMPTY_RESUME."""
        text_49 = "a" * 49
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text=text_49,
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.EMPTY_RESUME


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_none_parsing_status_with_text(self):
        """When parsing_successfully is None but text exists, treat as valid."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text="Valid resume content with sufficient length and more details",
            resume_parsed_successfully=None,
        )
        assert result.status == DataQualityStatus.VALID

    def test_none_parsing_status_without_text(self):
        """When parsing_successfully is None and no text, mark as EMPTY_RESUME."""
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text=None,
            resume_parsed_successfully=None,
        )
        assert result.status == DataQualityStatus.EMPTY_RESUME

    def test_unicode_content_accepted(self):
        """Resume with unicode content should be accepted if sufficient length."""
        text = "Currículo com acentuação: São Paulo, Pós-Graduação, Experiência internacional. " * 2
        result = DataQualityClassifier.classify(
            candidate_id="test-id",
            has_resume=True,
            resume_text=text,
            resume_parsed_successfully=True,
        )
        assert result.status == DataQualityStatus.VALID
