"""Centralized skill normalization and professional equivalence helpers."""

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


_DIRECTIONAL_EQUIVALENCES: dict[str, set[str]] = {
    "sql server": {"sql"},
    "postgresql": {"sql"},
    "mysql": {"sql"},
    "power bi": {"bi", "dashboard", "dashboards", "relatorios", "relatorio", "reporting"},
    "excel avancado": {"analise de dados", "analise", "relatorios", "relatorio", "administrativo"},
    "fastapi": {"api rest", "api", "python", "backend"},
    "react": {"frontend", "javascript", "typescript"},
    "suporte n1": {"suporte tecnico", "atendimento", "troubleshooting"},
    "suporte n2": {"suporte tecnico", "atendimento", "troubleshooting"},
    "protheus": {"erp", "totvs", "sistemas corporativos"},
    "rotinas fiscais": {"contabil", "financeiro operacional"},
}

_RELATED_GROUPS: dict[str, set[str]] = {
    "sql": {"sql", "sql server", "postgresql", "mysql"},
    "bi_dashboard": {"power bi", "bi", "dashboard", "dashboards", "relatorios", "relatorio", "reporting"},
    "excel_analytics": {"excel", "excel avancado", "analise de dados", "relatorios", "relatorio"},
    "backend_api": {"fastapi", "api rest", "api", "python", "backend"},
    "frontend_stack": {"react", "frontend", "javascript", "typescript"},
    "support": {"suporte n1", "suporte n2", "suporte tecnico", "atendimento", "troubleshooting"},
    "erp": {"protheus", "erp", "totvs", "sistemas corporativos"},
    "fiscal_ops": {"rotinas fiscais", "contabil", "financeiro operacional", "fiscal"},
    "customer_relations": {"atendimento", "customer service", "customer success", "relacionamento com cliente"},
    "mentorship": {"mentoria", "treinamento", "training", "mentor", "mentoring"},
    "leadership": {"lideranca", "lead", "manager", "management", "gerencia", "coordenacao"},
    "ai": {"ia", "llm", "rag", "machine learning", "ml"},
}


def _normalized_equivalence_targets(candidate_skill_name: str) -> set[str]:
    normalized_candidate = normalize_skill_text(candidate_skill_name)
    direct = _DIRECTIONAL_EQUIVALENCES.get(normalized_candidate, set())
    return {normalize_skill_text(item) for item in direct}


def candidate_satisfies_job_requirement(
    candidate_skill_name: str,
    job_skill_name: str,
    job_skill_aliases: list[str] | None = None,
) -> bool:
    candidate_normalized = normalize_skill_text(candidate_skill_name)
    job_normalized = normalize_skill_text(job_skill_name)

    if candidate_normalized == job_normalized:
        return True

    if job_skill_aliases:
        aliases_normalized = {
            normalize_skill_text(alias)
            for alias in job_skill_aliases
            if alias and normalize_skill_text(alias)
        }
        if candidate_normalized in aliases_normalized:
            return True

    if job_normalized in _normalized_equivalence_targets(candidate_skill_name):
        return True

    candidate_tokens = skill_tokens(candidate_normalized)
    job_tokens = skill_tokens(job_normalized)
    if candidate_tokens and job_tokens and (candidate_tokens <= job_tokens or job_tokens <= candidate_tokens):
        return True

    shorter, longer = sorted((candidate_normalized, job_normalized), key=len)
    if contains_whole_phrase(shorter, longer):
        return True

    if len(candidate_normalized) >= 4 and len(job_normalized) >= 4:
        if levenshtein_distance(candidate_normalized, job_normalized) <= 2:
            return True

    return False


def skill_related_groups(value: str) -> set[str]:
    normalized = normalize_skill_text(value)
    if not normalized:
        return set()

    groups: set[str] = set()
    for group, aliases in _RELATED_GROUPS.items():
        normalized_aliases = {normalize_skill_text(alias) for alias in aliases}
        if normalized in normalized_aliases:
            groups.add(group)
            continue
        if any(alias in normalized or normalized in alias for alias in normalized_aliases):
            groups.add(group)

    return groups or {normalized}


def primary_related_group(value: str) -> str:
    groups = sorted(skill_related_groups(value))
    return groups[0] if groups else normalize_skill_text(value)


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
