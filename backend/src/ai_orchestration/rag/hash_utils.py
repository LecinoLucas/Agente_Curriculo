"""SHA-256 content hashing utility for RAG deduplication."""
import hashlib


def compute_content_hash(content: str) -> str:
    """Return SHA-256 hex digest of UTF-8 encoded content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
