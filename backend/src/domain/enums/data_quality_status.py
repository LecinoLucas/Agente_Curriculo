from enum import Enum


class DataQualityStatus(str, Enum):
    """Data quality classification for candidates.

    Statuses:
    - VALID: Data successfully extracted and classified
    - UNKNOWN: Not yet classified (legitimate pending state)
    - NO_RESUME: Candidate has no resume attached
    - EMPTY_RESUME: Resume file exists but has no extractable text
    - PARSING_FAILED: Resume parsing failed (format unsupported or corrupted)
    - INVALID_MANUAL: Manually marked as invalid by admin
    """

    VALID = "valid"
    NO_RESUME = "no_resume"
    EMPTY_RESUME = "empty_resume"
    PARSING_FAILED = "parsing_failed"
    INVALID_MANUAL = "invalid_manual"
    UNKNOWN = "unknown"  # Legitimate state: not yet classified

    @classmethod
    def is_valid(cls, status: str) -> bool:
        """Check if status is valid."""
        return status in cls.__members__.values()

    @classmethod
    def valid_statuses(cls) -> list[str]:
        """Return all valid statuses."""
        return [s.value for s in cls]
