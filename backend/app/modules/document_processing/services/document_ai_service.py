from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Any

_CPF_PATTERN = re.compile(r"\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b")
_DATE_PATTERN = re.compile(r"\b(\d{2})[/-](\d{2})[/-](\d{4})\b")
_RG_PATTERN = re.compile(r"\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b")
_CNH_PATTERN = re.compile(r"\b\d{11}\b")
_CNPJ_PATTERN = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")

_NAME_LABEL = re.compile(
    r"(?:^|\b)(?:nome|nome completo|titular)\s*[:\-]\s*([A-Za-zÀ-ÖØ-öø-ÿ' ]{5,})",
    re.IGNORECASE,
)

_BIRTH_LABEL = re.compile(
    r"(?:data de nascimento|nascimento|nasc\.?)\s*[:\-]?\s*(\d{2}[/-]\d{2}[/-]\d{4})",
    re.IGNORECASE,
)

_DOC_NUMBER_LABEL = re.compile(
    r"(?:registro geral|identidade|rg|documento(?:\s*n[úu]mero)?|n[úu]mero do documento)\s*[:\-]?\s*([A-Za-z0-9.\-/]{5,})",
    re.IGNORECASE,
)


def extract_structured_data(clean_text: str) -> dict[str, Any]:
    text = _normalize_text(clean_text)
    evidence_score = 0.0

    nome = _extract_name(text)
    if nome is not None:
        evidence_score += 0.2

    cpf = _extract_cpf(text)
    if cpf is not None:
        evidence_score += 0.3

    data_nascimento = _extract_birth_date(text)
    if data_nascimento is not None:
        evidence_score += 0.2

    documento_numero = _extract_document_number(text, cpf=cpf)
    if documento_numero is not None:
        evidence_score += 0.15

    text_quality = _text_quality_score(text)
    confidence = round(min(max(evidence_score + text_quality, 0.0), 1.0), 2)

    result: dict[str, Any] = {
        "nome": nome,
        "cpf": cpf,
        "data_nascimento": data_nascimento,
        "documento_numero": documento_numero,
        "confidence": confidence,
    }
    result["missing_fields"] = [field for field in ("nome", "cpf", "data_nascimento", "documento_numero") if result[field] is None]
    return result


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "")
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[ \t\f\v]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _extract_name(text: str) -> str | None:
    match = _NAME_LABEL.search(text)
    if not match:
        return None

    candidate = _sanitize_name(match.group(1))
    if candidate is None:
        return None
    return candidate


def _extract_cpf(text: str) -> str | None:
    for match in _CPF_PATTERN.finditer(text):
        digits = "".join(match.groups())
        if _is_valid_cpf(digits):
            return f"{digits[0:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:11]}"
    return None


def _extract_birth_date(text: str) -> str | None:
    labeled = _BIRTH_LABEL.search(text)
    if labeled:
        normalized = _normalize_date(labeled.group(1))
        if normalized is not None:
            return normalized

    for match in _DATE_PATTERN.finditer(text):
        normalized = _normalize_date(match.group(0))
        if normalized is not None:
            return normalized
    return None


def _extract_document_number(text: str, cpf: str | None) -> str | None:
    labeled = _DOC_NUMBER_LABEL.search(text)
    if labeled:
        value = _sanitize_document_number(labeled.group(1))
        if value is not None and value != cpf:
            return value

    rg_match = _RG_PATTERN.search(text)
    if rg_match:
        rg = _sanitize_document_number(rg_match.group(0))
        if rg is not None and rg != cpf:
            return rg

    for match in _CNH_PATTERN.finditer(text):
        cnh = _sanitize_document_number(match.group(0))
        if cnh is not None and cnh != (cpf or "").replace(".", "").replace("-", ""):
            return cnh

    cnpj_match = _CNPJ_PATTERN.search(text)
    if cnpj_match:
        cnpj = _sanitize_document_number(cnpj_match.group(0))
        if cnpj is not None and cnpj != cpf:
            return cnpj

    return None


def _sanitize_name(value: str) -> str | None:
    cleaned = re.sub(r"\s+", " ", value).strip(" -")
    if len(cleaned) < 5:
        return None
    if len(cleaned.split()) < 2:
        return None
    if any(char.isdigit() for char in cleaned):
        return None
    return cleaned


def _sanitize_document_number(value: str) -> str | None:
    cleaned = value.strip(" .-:/")
    cleaned = re.sub(r"\s+", "", cleaned)
    if len(cleaned) < 5:
        return None
    return cleaned


def _normalize_date(raw: str) -> str | None:
    match = _DATE_PATTERN.search(raw)
    if not match:
        return None
    day, month, year = match.groups()
    try:
        dt = datetime(int(year), int(month), int(day))
    except ValueError:
        return None
    if dt.year < 1900 or dt > datetime.utcnow():
        return None
    return dt.strftime("%Y-%m-%d")


def _is_valid_cpf(cpf_digits: str) -> bool:
    if len(cpf_digits) != 11 or len(set(cpf_digits)) == 1:
        return False

    numbers = [int(char) for char in cpf_digits]

    sum_first = sum(numbers[i] * (10 - i) for i in range(9))
    first_digit = (sum_first * 10) % 11
    if first_digit == 10:
        first_digit = 0
    if first_digit != numbers[9]:
        return False

    sum_second = sum(numbers[i] * (11 - i) for i in range(10))
    second_digit = (sum_second * 10) % 11
    if second_digit == 10:
        second_digit = 0
    return second_digit == numbers[10]


def _text_quality_score(text: str) -> float:
    if not text:
        return 0.0

    length_score = min(len(text) / 1200.0, 0.2)
    alnum = sum(1 for char in text if char.isalnum())
    ratio = alnum / max(len(text), 1)
    ratio_score = min(max((ratio - 0.35) / 0.65, 0.0), 1.0) * 0.15
    return round(length_score + ratio_score, 4)

