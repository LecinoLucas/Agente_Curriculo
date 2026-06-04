from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

LOW_QUALITY_FAILURE_REASON = "extracted_text_low_quality"

_MIN_USEFUL_CHARS = 20
_MIN_ALPHA_CHARS = 12
_MIN_ALPHA_WORDS = 4
_MIN_ALPHA_RATIO = 0.35
_MAX_REPEATED_TOKEN_RATIO = 0.65
_PROFESSIONAL_TERMS = {
    "administrativo",
    "analista",
    "assistant",
    "assistente",
    "atendimento",
    "auxiliar",
    "backend",
    "caixa",
    "cargo",
    "certificacao",
    "certificação",
    "comercial",
    "competencia",
    "competência",
    "curso",
    "desenvolvedor",
    "developer",
    "educacao",
    "educação",
    "empresa",
    "engenheiro",
    "excel",
    "experiencia",
    "experiência",
    "experience",
    "financeiro",
    "formacao",
    "formação",
    "frontend",
    "funcao",
    "função",
    "gerente",
    "graduacao",
    "graduação",
    "habilidade",
    "javascript",
    "logistica",
    "logística",
    "marketing",
    "operador",
    "profissional",
    "projeto",
    "python",
    "react",
    "sql",
    "supervisor",
    "tecnico",
    "técnico",
    "vendedor",
    "vendas",
}


@dataclass(frozen=True)
class ExtractedTextQuality:
    text: str
    is_useful: bool
    reason: str | None
    char_count: int
    alpha_count: int
    alpha_word_count: int
    alpha_ratio: float
    professional_term_count: int
    unique_token_ratio: float
    repeated_token_ratio: float
    max_char_run: int


def _clean_for_quality(text: str) -> str:
    cleaned = text.replace("\u00a0", " ")
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n[ \t]+", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _alpha_tokens(text: str) -> list[str]:
    tokens = re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9+#./-]*", text)
    return [token.lower() for token in tokens if re.search(r"[A-Za-zÀ-ÿ]", token)]


def _max_repeated_char_run(text: str) -> int:
    if not text:
        return 0

    max_run = 1
    current = 1
    previous = text[0]
    for char in text[1:]:
        if char == previous:
            current += 1
            max_run = max(max_run, current)
        else:
            previous = char
            current = 1
    return max_run


def assess_extracted_text_quality(text: str | None) -> ExtractedTextQuality:
    cleaned = _clean_for_quality(text or "")
    char_count = len(cleaned)
    alpha_count = len(re.findall(r"[A-Za-zÀ-ÿ]", cleaned))
    non_space_count = len(re.sub(r"\s+", "", cleaned))
    alpha_ratio = alpha_count / non_space_count if non_space_count else 0.0
    tokens = _alpha_tokens(cleaned)
    alpha_word_count = len(tokens)
    token_counts = Counter(tokens)
    unique_token_ratio = len(token_counts) / alpha_word_count if alpha_word_count else 0.0
    repeated_token_ratio = (
        max(token_counts.values()) / alpha_word_count if token_counts else 0.0
    )
    max_char_run = _max_repeated_char_run(cleaned)
    professional_term_count = sum(
        1 for token in tokens if token.strip(".:/-") in _PROFESSIONAL_TERMS
    )

    reason: str | None = None
    if not cleaned:
        reason = "empty"
    elif char_count < _MIN_USEFUL_CHARS:
        reason = "too_short"
    elif alpha_count < _MIN_ALPHA_CHARS:
        reason = "too_few_letters"
    elif alpha_word_count < _MIN_ALPHA_WORDS:
        reason = "too_few_words"
    elif alpha_ratio < _MIN_ALPHA_RATIO:
        reason = "too_much_noise"
    elif max_char_run >= 10 and alpha_count < 30:
        reason = "repeated_characters"
    elif alpha_word_count >= 6 and (
        len(token_counts) <= 2 or repeated_token_ratio > _MAX_REPEATED_TOKEN_RATIO
    ):
        reason = "repeated_tokens"
    elif professional_term_count == 0 and (char_count < 80 or alpha_word_count < 12):
        reason = "no_professional_signal"

    return ExtractedTextQuality(
        text=cleaned,
        is_useful=reason is None,
        reason=reason,
        char_count=char_count,
        alpha_count=alpha_count,
        alpha_word_count=alpha_word_count,
        alpha_ratio=alpha_ratio,
        professional_term_count=professional_term_count,
        unique_token_ratio=unique_token_ratio,
        repeated_token_ratio=repeated_token_ratio,
        max_char_run=max_char_run,
    )


def is_extracted_text_useful(text: str | None) -> bool:
    return assess_extracted_text_quality(text).is_useful
