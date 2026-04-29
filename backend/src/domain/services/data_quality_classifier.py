"""Data quality classification service for candidates.

Automatically classifies candidates based on available resume and profile data.
"""

from typing import Optional
from dataclasses import dataclass
from src.domain.enums.data_quality_status import DataQualityStatus


@dataclass
class ClassificationResult:
    """Result of candidate classification."""
    status: DataQualityStatus
    reason: str


class DataQualityClassifier:
    """Classifies candidate data quality."""

    @staticmethod
    def classify(
        candidate_id: str,
        has_resume: bool,
        resume_text: Optional[str] = None,
        resume_parsed_successfully: Optional[bool] = None,
        minimum_profile_fields: int = 3,
    ) -> ClassificationResult:
        """Classify candidate data quality.

        Args:
            candidate_id: UUID of candidate (for logging)
            has_resume: Whether candidate has at least one resume
            resume_text: Raw text from resume document (if available)
            resume_parsed_successfully: Whether resume parsing succeeded
            minimum_profile_fields: Minimum required profile fields (email, phone, location, etc.)

        Returns:
            ClassificationResult with status and reason
        """

        # Check 1: No resume at all
        if not has_resume:
            return ClassificationResult(
                status=DataQualityStatus.NO_RESUME,
                reason="Candidate has no resume attached"
            )

        # Check 2: Resume parsing failed
        if resume_parsed_successfully is False:
            return ClassificationResult(
                status=DataQualityStatus.PARSING_FAILED,
                reason="Resume parsing failed - invalid document format or corrupted data"
            )

        # Check 3: Empty resume (no text content)
        if not resume_text or len(resume_text.strip()) == 0:
            return ClassificationResult(
                status=DataQualityStatus.EMPTY_RESUME,
                reason="Resume has no extractable text content"
            )

        # Check 4: Resume content too short (less than 50 chars)
        if len(resume_text.strip()) < 50:
            return ClassificationResult(
                status=DataQualityStatus.EMPTY_RESUME,
                reason="Resume content is too short to be meaningful"
            )

        # Check 5: Resume has sufficient content
        return ClassificationResult(
            status=DataQualityStatus.VALID,
            reason="Candidate has resume with sufficient content"
        )
