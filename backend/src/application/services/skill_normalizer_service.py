"""Centralized skill normalization helpers."""

from __future__ import annotations

import re
import unicodedata


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_skill_name(value: str | None) -> str:
    if value is None:
        return ""

    normalized = _strip_accents(str(value).strip().lower())
    normalized = normalized.replace("-", " ").replace("_", " ")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def normalize_skill_text(value: str) -> str:
    normalized = _strip_accents(value.lower().strip())
    normalized = re.sub(r"[*_`~]+", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def normalize_skill_token(token: str) -> str:
    cleaned = normalize_skill_text(token)
    cleaned = re.sub(r"^[^\w#+.]+|[^\w#+.]+$", "", cleaned)
    return cleaned


def skill_tokens(value: str) -> set[str]:
    normalized = normalize_skill_text(value)
    return {
        token
        for token in (normalize_skill_token(part) for part in normalized.split(" "))
        if token
    }


def contains_whole_phrase(shorter: str, longer: str) -> bool:
    if not shorter or not longer:
        return False
    if shorter == longer:
        return True

    pattern = rf"(^|\s){re.escape(shorter)}(\s|$)"
    return re.search(pattern, longer) is not None


def levenshtein_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]
