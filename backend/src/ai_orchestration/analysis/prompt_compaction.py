import re

from src.core.settings import settings


def _normalize_multiline_text(value: str) -> str:
    lines = [line.strip() for line in (value or "").splitlines()]
    non_empty = [line for line in lines if line]
    return "\n".join(non_empty)


def _truncate_with_notice(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    suffix = "\n\n[conteudo truncado para controle de custo]"
    limit = max(0, max_chars - len(suffix))
    return value[:limit].rstrip() + suffix


def _remove_sensitive_resume_data(value: str) -> str:
    sanitized = value
    sanitized = re.sub(
        r"\b[\w\.-]+@[\w\.-]+\.\w+\b",
        "[email_removido]",
        sanitized,
        flags=re.IGNORECASE,
    )
    sanitized = re.sub(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "[cpf_removido]", sanitized)
    sanitized = re.sub(
        r"(?:(?:\+?55)\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-\s]?\d{4}",
        "[telefone_removido]",
        sanitized,
    )
    return sanitized


def _extract_relevant_resume_lines(value: str) -> str:
    lines = [line.strip() for line in value.splitlines()]
    section_keywords = {
        "experience": (
            "experiencia",
            "experiência",
            "experience",
            "cargo",
            "empresa",
            "projeto",
            "role",
        ),
        "skills": (
            "skill",
            "skills",
            "habilidade",
            "habilidades",
            "competencia",
            "competências",
            "stack",
        ),
        "education": (
            "formacao",
            "formação",
            "educacao",
            "educação",
            "education",
            "curso",
            "graduacao",
            "graduação",
        ),
    }
    inline_keywords = tuple({kw for values in section_keywords.values() for kw in values})

    selected: list[str] = []
    selected_keys: set[str] = set()
    active_section: str | None = None
    must_keep_terms = (
        "sql",
        "api",
        "rest",
        "erp",
        "protheus",
        "requisitos",
        "sistemas",
        "integracoes",
        "integrações",
        "experiencia",
        "experiência",
        "formacao",
        "formação",
    )

    for raw_line in lines:
        if not raw_line:
            continue
        normalized = raw_line.lower()
        normalized = (
            normalized.replace("ç", "c")
            .replace("ã", "a")
            .replace("á", "a")
            .replace("é", "e")
        )
        key = normalized.strip()

        if any(term in normalized for term in must_keep_terms):
            if key not in selected_keys:
                selected.append(raw_line)
                selected_keys.add(key)
            if len(selected) >= 160:
                break

        switched = False
        for section_name, keywords in section_keywords.items():
            if any(keyword in normalized for keyword in keywords):
                active_section = section_name
                switched = True
                break

        if switched or active_section is not None:
            if key not in selected_keys:
                selected.append(raw_line)
                selected_keys.add(key)
            if len(selected) >= 160:
                break
            continue

        if any(keyword in normalized for keyword in inline_keywords):
            if key not in selected_keys:
                selected.append(raw_line)
                selected_keys.add(key)
            if len(selected) >= 160:
                break

    if not selected:
        selected = [line for line in lines if line][:60]

    return "\n".join(selected)


def compact_resume_for_prompt(resume_text: str) -> str:
    normalized = _normalize_multiline_text(resume_text)
    sanitized = _remove_sensitive_resume_data(normalized)
    relevant = _extract_relevant_resume_lines(sanitized)
    return _truncate_with_notice(relevant, int(settings.AI_ANALYSIS_MAX_RESUME_CHARS))


def compact_job_for_prompt(job) -> str:
    """Compact a job object (duck-typed: reads title/requirements/responsibilities/description)."""
    sections: list[tuple[str, str | None]] = [
        ("Titulo", getattr(job, "title", None)),
        ("Requisitos", getattr(job, "requirements", None)),
        ("Responsabilidades", getattr(job, "responsibilities", None)),
        ("Descricao", getattr(job, "description", None)),
    ]

    chunks: list[str] = []
    for title, value in sections:
        if not value:
            continue
        normalized = _normalize_multiline_text(value)
        if not normalized:
            continue
        chunks.append(f"{title}:\n{normalized}")

    if not chunks:
        return ""

    max_chars = int(settings.AI_ANALYSIS_MAX_JOB_CHARS)
    merged = "\n\n".join(chunks)
    return _truncate_with_notice(merged, max_chars)
