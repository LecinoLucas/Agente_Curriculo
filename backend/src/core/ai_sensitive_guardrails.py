from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

SENSITIVE_TEXT_REPLACEMENT = "[criterio_sensivel_removido]"
SENSITIVE_REASON_REMOVED_MESSAGE = "Critério sensível removido da justificativa."

SENSITIVE_CATEGORIES = {
    "age_birth_date": (
        "idade",
        "age",
        "data de nascimento",
        "birth date",
        "birth_date",
        "date of birth",
        "nascimento",
        "nascido",
        "anos de idade",
    ),
    "gender_identity": (
        "genero",
        "gênero",
        "gender",
        "sexo",
        "sex",
        "masculino",
        "feminino",
        "transgenero",
        "transgênero",
    ),
    "race_ethnicity": (
        "raca",
        "raça",
        "race",
        "cor",
        "etnia",
        "ethnicity",
        "etnico",
        "étnico",
        "negro",
        "negra",
        "branco",
        "branca",
        "indigena",
        "indígena",
    ),
    "religion": (
        "religiao",
        "religião",
        "religion",
        "cristao",
        "cristão",
        "evangelico",
        "evangélico",
        "catolico",
        "católico",
        "umbanda",
        "candomble",
        "candomblé",
        "espirita",
        "espírita",
        "ateu",
        "ateia",
    ),
    "family_marital": (
        "estado civil",
        "marital status",
        "marital_status",
        "casado",
        "casada",
        "solteiro",
        "solteira",
        "divorciado",
        "divorciada",
        "filho",
        "filha",
        "filhos",
        "children",
        "familia",
        "família",
        "gravidez",
        "pregnancy",
        "gravida",
        "grávida",
        "gestante",
    ),
    "health_disability": (
        "ansioso",
        "ansiosa",
        "ansiedade",
        "instavel",
        "instável",
        "depressivo",
        "depressiva",
        "depressao",
        "depressão",
        "narcisista",
        "narcisismo",
        "perfil psicologico",
        "perfil psicológico",
        "diagnostico",
        "diagnóstico",
        "transtorno",
        "disturbio",
        "distúrbio",
        "psicopatia",
        "psicose",
        "deficiencia",
        "deficiência",
        "doenca",
        "doença",
        "condicao medica",
        "condição médica",
        "tratamento medico",
        "tratamento médico",
        "laudo medico",
        "laudo médico",
        "cid",
        "autismo",
        "saude mental",
        "saúde mental",
        "medical condition",
        "health",
        "disability",
    ),
    "appearance_photo": (
        "aparencia",
        "aparência",
        "appearance",
        "foto",
        "photo",
        "imagem",
        "peso",
        "altura",
        "bonito",
        "bonita",
    ),
    "address_proxy": (
        "endereco",
        "endereço",
        "address",
        "bairro",
        "neighborhood",
        "mora em",
        "reside em",
        "distancia",
        "distância",
        "distance",
        "longe",
        "perto",
        "cep",
    ),
    "nationality_origin": (
        "nacionalidade",
        "nationality",
        "naturalidade",
        "estrangeiro",
        "estrangeira",
        "imigrante",
    ),
    "sexual_orientation": (
        "orientacao sexual",
        "orientação sexual",
        "sexual orientation",
        "sexual_orientation",
        "homossexual",
        "heterossexual",
        "bissexual",
        "lgbt",
        "lgbtq",
    ),
}

_SENSITIVE_TERMS = tuple(
    term for terms in SENSITIVE_CATEGORIES.values() for term in terms
)

_EMAIL_RE = re.compile(r"\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
_CPF_LABEL_RE = re.compile(r"(?i)\bcpf\s*[:#-]?\s*\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
_CPF_RE = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
_PHONE_LABEL_RE = re.compile(
    r"(?i)\b(?:telefone|whatsapp|celular|phone)\s*[:#-]?\s*"
    r"(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}\b"
)
_PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}(?!\d)"
)
_RG_RE = re.compile(
    r"(?i)\b(?:rg|registro\s+geral|identidade)\s*(?:n[ºo.]?\s*)?[:#-]?\s*"
    r"\d{1,2}\.?\d{3}\.?\d{3}-?[\dX]\b"
)
_CEP_RE = re.compile(r"(?i)\b(?:cep\s*[:#-]?\s*)?\d{5}-\d{3}\b")
_CEP_LABEL_RE = re.compile(r"(?i)\bcep\s*[:#-]?\s*\d{8}\b")
_BIRTH_DATE_RE = re.compile(
    r"(?i)\b(data\s+de\s+nascimento|nascimento|nascid[ao]\s+em|birth\s+date|dob)"
    r"\s*[:#-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"
)
_AGE_RE = re.compile(
    r"(?i)\b(?:idade\s*[:#-]?\s*)?\d{1,3}\s+(?:anos\s+de\s+idade|anos)\b"
)
_ADDRESS_RE = re.compile(
    r"(?i)\b(?:rua|avenida|av\.|alameda|travessa|rodovia|estrada|pra[çc]a)\s+"
    r"[^,\n\"{}\[\]]{2,80}(?:,\s*\d{1,6})?"
)
_SENSITIVE_TERM_RE = re.compile(
    r"(?i)\b("
    + "|".join(re.escape(term) for term in sorted(_SENSITIVE_TERMS, key=len, reverse=True))
    + r")\b"
)


def redact_sensitive_text(value: str | None) -> str | None:
    """Return text safe for DB/UI by removing PII and protected-attribute criteria."""
    if value is None:
        return None

    redacted = str(value)
    redacted = _EMAIL_RE.sub("[email_removido]", redacted)
    redacted = _CPF_LABEL_RE.sub("[cpf_removido]", redacted)
    redacted = _PHONE_LABEL_RE.sub("[telefone_removido]", redacted)
    redacted = _CPF_RE.sub("[cpf_removido]", redacted)
    redacted = _RG_RE.sub("[rg_removido]", redacted)
    redacted = _PHONE_RE.sub("[telefone_removido]", redacted)
    redacted = _CEP_LABEL_RE.sub("[cep_removido]", redacted)
    redacted = _CEP_RE.sub("[cep_removido]", redacted)
    redacted = _BIRTH_DATE_RE.sub(SENSITIVE_TEXT_REPLACEMENT, redacted)
    redacted = _AGE_RE.sub(SENSITIVE_TEXT_REPLACEMENT, redacted)
    redacted = _ADDRESS_RE.sub("[endereco_removido]", redacted)
    redacted = _SENSITIVE_TERM_RE.sub(SENSITIVE_TEXT_REPLACEMENT, redacted)
    return redacted


def contains_sensitive_text(value: Any) -> bool:
    if value is None:
        return False
    text = str(value)
    normalized_code_text = text.replace("_", " ").replace("-", " ")
    return (
        redact_sensitive_text(text) != text
        or redact_sensitive_text(normalized_code_text) != normalized_code_text
    )


def redact_sensitive_payload(value: Any) -> Any:
    if isinstance(value, str):
        return redact_sensitive_text(value)

    if isinstance(value, Mapping):
        return {
            key: redact_sensitive_payload(item)
            for key, item in value.items()
        }

    if isinstance(value, tuple):
        return tuple(redact_sensitive_payload(item) for item in value)

    if isinstance(value, Sequence) and not isinstance(value, bytes | bytearray):
        return [redact_sensitive_payload(item) for item in value]

    return value


def sanitize_text_list(values: Any, *, drop_sensitive: bool = True) -> list[str]:
    if not isinstance(values, list):
        return []

    sanitized: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        if contains_sensitive_text(text) and drop_sensitive:
            continue
        redacted = redact_sensitive_text(text)
        if not redacted:
            continue
        key = redacted.casefold()
        if key in seen:
            continue
        seen.add(key)
        sanitized.append(redacted)
    return sanitized


def sanitize_reason_codes(values: Any) -> list[Any]:
    if not isinstance(values, list):
        return []

    sanitized: list[Any] = []
    for item in values:
        if contains_sensitive_text(item):
            continue
        sanitized.append(redact_sensitive_payload(item))
    return sanitized


def _drop_sensitive_mapping_entries(value: Any) -> Any:
    if isinstance(value, Mapping):
        result: dict[Any, Any] = {}
        for key, item in value.items():
            if contains_sensitive_text(key):
                continue
            result[key] = _drop_sensitive_mapping_entries(item)
        return result

    if isinstance(value, list):
        return [
            _drop_sensitive_mapping_entries(item)
            for item in value
            if not contains_sensitive_text(item)
        ]

    if isinstance(value, tuple):
        return tuple(
            _drop_sensitive_mapping_entries(item)
            for item in value
            if not contains_sensitive_text(item)
        )

    return redact_sensitive_payload(value)


def sanitize_resume_analysis_result(result: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(result)
    for key in ("candidate_summary",):
        sanitized[key] = redact_sensitive_text(sanitized.get(key))

    for key in ("strengths", "weaknesses", "recommendations", "keywords"):
        sanitized[key] = sanitize_text_list(sanitized.get(key), drop_sensitive=True)

    extracted = sanitized.get("extracted_data")
    if isinstance(extracted, dict):
        raw_extracted = extracted
        extracted = redact_sensitive_payload(extracted)
        skills = extracted.get("skills")
        raw_skills = raw_extracted.get("skills")
        if isinstance(skills, list) and isinstance(raw_skills, list):
            extracted["skills"] = [
                skill
                for raw_skill, skill in zip(raw_skills, skills, strict=False)
                if not contains_sensitive_text(raw_skill)
            ]
        for key in ("tools", "leadership_signals", "impact_signals"):
            extracted[key] = sanitize_text_list(raw_extracted.get(key), drop_sensitive=True)
        sanitized["extracted_data"] = extracted

    return sanitized


def sanitize_ranking_payload(payload: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(payload)
    sanitized["breakdown"] = _drop_sensitive_mapping_entries(
        sanitized.get("breakdown") or {}
    )
    sanitized["reason_codes"] = sanitize_reason_codes(sanitized.get("reason_codes") or [])
    sanitized["factor_summary_json"] = _drop_sensitive_mapping_entries(
        sanitized.get("factor_summary_json") or {}
    )
    sanitized["delta_summary_json"] = _drop_sensitive_mapping_entries(
        sanitized.get("delta_summary_json") or {}
    )
    sanitized["factors"] = sanitize_reason_codes(sanitized.get("factors") or [])
    sanitized["explanation_text"] = redact_sensitive_text(
        sanitized.get("explanation_text")
    )
    return sanitized
