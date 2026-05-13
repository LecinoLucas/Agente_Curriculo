from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


_SECRET_QUERY_KEYS = {
    "access_token",
    "api_key",
    "client_secret",
    "id_token",
    "key",
    "refresh_token",
    "token",
}
_GOOGLE_API_KEY_RE = re.compile(r"AIza[0-9A-Za-z_-]{20,}")
_BEARER_TOKEN_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")
_ASSIGNMENT_SECRET_RE = re.compile(
    r"(?i)\b(key|api_key|access_token|refresh_token|id_token|client_secret)=([^&\s]+)"
)


def sanitize_url(value: str) -> str:
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.netloc:
        return sanitize_log_text(value)

    query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
    sanitized_pairs = [
        (key, "[REDACTED]" if key.lower() in _SECRET_QUERY_KEYS else item_value)
        for key, item_value in query_pairs
    ]
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(sanitized_pairs, doseq=True),
            parsed.fragment,
        )
    )


def sanitize_log_text(value: object | None) -> str | None:
    if value is None:
        return None

    text = str(value)
    text = _GOOGLE_API_KEY_RE.sub("[REDACTED_GOOGLE_API_KEY]", text)
    text = _BEARER_TOKEN_RE.sub("Bearer [REDACTED]", text)
    text = _ASSIGNMENT_SECRET_RE.sub(lambda match: f"{match.group(1)}=[REDACTED]", text)
    return text
