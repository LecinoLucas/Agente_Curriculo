"""
ResumeProfilerService — Gera perfis semânticos de candidatos a partir de currículos.

Fluxo:
  1. Calcula hash SHA-256 do currículo → chave de cache.
  2. Se hit no cache → retorna CandidateProfile imediatamente (sem chamar IA).
  3. Se miss → chama IA, parseia resposta, armazena no cache, retorna perfil.
  4. Se IA falhar → retorna CandidateProfile de fallback seguro (nunca levanta exceção).

O cache padrão é um dict em memória (adequado para testes e desenvolvimento).
Para produção com Redis, passe uma instância de RedisCandidateProfileCache.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any

import structlog

from src.application.ports.ai_service import AIAnalysisRequest, AIService
from src.domain.value_objects.candidate_profile import (
    CandidateCapability,
    CandidateProfile,
    CertificationEntry,
    EducationEntry,
    EvidencedSkill,
    Experience,
    VALID_CONFIDENCE,
    VALID_SOURCES,
    VALID_STRENGTHS,
)
from src.infrastructure.ai.prompts import resume_profiler as _prompt
from src.infrastructure.ai.response_parser import extract_json

logger = structlog.get_logger(__name__)

_DEFAULT_TTL_SECONDS: int = 86_400
_MAX_COMPACT_SKILLS = 12
_MAX_COMPACT_EXPERIENCES = 8
_MAX_COMPACT_ROLE_CHARS = 120
_MAX_COMPACT_SKILL_WORDS = 5

_SKILL_SECTION_HINTS = (
    "skill",
    "skills",
    "habilidade",
    "habilidades",
    "competencia",
    "competências",
    "competencias",
    "stack",
    "tecnologias",
    "tecnologia",
    "ferramentas",
)
_SKILL_LABEL_HINTS = (
    "principais competencias",
    "principais competências",
    "core competencies",
    "competencias principais",
    "competências principais",
)
_EXPERIENCE_SECTION_HINTS = (
    "experiencia",
    "experiência",
    "experience",
    "cargo",
    "empresa",
    "projeto",
    "atuacao",
    "atuação",
)
_LEVEL_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"(?i)\bprincipal\b", "principal"),
    (r"(?i)\blead\b|\btech lead\b|\bcoordenador\b|\bcoordenadora\b|\bgerente\b", "lead"),
    (r"(?i)\bsenior\b|\bsênior\b", "senior"),
    (r"(?i)\bpleno\b|\bmid\b", "mid"),
    (r"(?i)\bjunior\b|\bjúnior\b", "junior"),
    (r"(?i)\bestagio\b|\bestágio\b|\bintern\b", "intern"),
)
_CONTACT_HINTS = (
    "contato",
    "contact",
    "email",
    "e-mail",
    "telefone",
    "phone",
    "celular",
    "linkedin",
    "github",
    "portfolio",
    "portfólio",
    "www.",
    "http://",
    "https://",
)
_COMMON_SECTION_HEADINGS = {
    "sobre",
    "about",
    "resumo",
    "summary",
    "skills",
    "habilidades",
    "competencias",
    "competências",
    "principais competencias",
    "principais competências",
    "experience",
    "experiencia",
    "experiência",
    "education",
    "educacao",
    "educação",
    "projects",
    "projetos",
    "contact",
    "contato",
}
_ROLE_HINTS = (
    "engineer",
    "engenheiro",
    "developer",
    "desenvolvedor",
    "analyst",
    "analista",
    "manager",
    "gerente",
    "coordenador",
    "coordenadora",
    "consultor",
    "consultora",
    "designer",
    "tech lead",
    "lead",
    "qa",
    "backend",
    "frontend",
    "full stack",
    "fullstack",
    "devops",
    "product",
    "support",
    "suporte",
    "data",
    "sales",
    "comercial",
)
_COUNTRY_OR_STATE_HINTS = {
    "brasil",
    "brazil",
    "acre",
    "alagoas",
    "amapa",
    "amazonas",
    "bahia",
    "ceara",
    "distrito federal",
    "espirito santo",
    "goias",
    "maranhao",
    "mato grosso",
    "mato grosso do sul",
    "minas gerais",
    "para",
    "paraiba",
    "parana",
    "pernambuco",
    "piaui",
    "rio de janeiro",
    "rio grande do norte",
    "rio grande do sul",
    "rondonia",
    "roraima",
    "santa catarina",
    "sao paulo",
    "sergipe",
    "tocantins",
}
_STATE_ABBRS = {
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
}
_SKILL_KEYWORDS = {
    "python",
    "java",
    "javascript",
    "typescript",
    "sql",
    "postgresql",
    "mysql",
    "oracle",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "fastapi",
    "django",
    "flask",
    "react",
    "node",
    "node.js",
    "apis",
    "api",
    "rest",
    "erp",
    "sap",
    "totvs",
    "protheus",
    "excel",
    "power bi",
    "tableau",
    "suporte tecnico",
    "documentacao tecnica",
}
_PHONE_RE = re.compile(
    r"(?:(?:\+?55)\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-\s]?\d{4}",
    re.IGNORECASE,
)
_EMAIL_RE = re.compile(
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    re.IGNORECASE,
)


class InMemoryCandidateProfileCache:
    """Cache em memória — thread-safe para uso single-process."""

    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}

    def get(self, key: str) -> dict[str, Any] | None:
        return self._store.get(key)

    def set(self, key: str, value: dict[str, Any], ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> None:
        self._store[key] = value

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()

    def __len__(self) -> int:
        return len(self._store)


class ResumeProfilerService:
    """
    Gera e cacheia CandidateProfile a partir de um currículo em texto.

    Parâmetros:
      ai_service — adaptador de IA (ClaudeAdapter, GeminiAdapter, mock para testes).
      cache      — instância de cache (default: InMemoryCandidateProfileCache).
    """

    def __init__(
        self,
        ai_service: AIService,
        cache: InMemoryCandidateProfileCache | None = None,
    ) -> None:
        self._ai = ai_service
        self._cache = cache if cache is not None else InMemoryCandidateProfileCache()

    async def generate_profile(self, resume_text: str) -> CandidateProfile:
        """
        Retorna um CandidateProfile para o currículo fornecido.

        Nunca levanta exceção — se a IA falhar, retorna um perfil de fallback
        com confidence="low" e profile_completeness=0.0 para que o sistema
        continue funcionando.
        """
        if not resume_text or not resume_text.strip():
            return self._fallback_profile("")

        resume_hash = _hash(resume_text)

        cached = self._cache.get(resume_hash)
        if cached is not None:
            logger.info("resume_profiler.cache_hit", hash=resume_hash)
            return CandidateProfile.from_dict(cached)

        logger.info("resume_profiler.cache_miss", hash=resume_hash)

        try:
            profile = await self._call_ai(resume_text, resume_hash)
        except Exception as exc:
            logger.warning(
                "resume_profiler.ai_failed",
                hash=resume_hash,
                error=str(exc),
            )
            profile = self._fallback_profile(resume_hash)

        self._cache.set(resume_hash, profile.to_dict())
        return profile

    def invalidate(self, resume_text: str) -> None:
        """Remove o perfil cacheado para forçar re-geração na próxima chamada."""
        self._cache.invalidate(_hash(resume_text))

    async def _call_ai(self, resume_text: str, resume_hash: str) -> CandidateProfile:
        compact_resume_text = _build_resume_ai_context(resume_text)
        prompt = _safe_prompt_format(
            _prompt.USER_PROMPT_TEMPLATE,
            resume_text=compact_resume_text,
        )
        request = AIAnalysisRequest(
            resume_text=compact_resume_text,
            prompt_template=prompt,
            system_prompt=_prompt.SYSTEM_PROMPT,
            max_tokens=4096,
            temperature=0.1,
        )
        response = await self._ai.analyze(request)
        raw = extract_json(response.content)

        logger.info(
            "resume_profiler.ai_response",
            hash=resume_hash,
            detected_level=raw.get("detected_level"),
            experience_years=raw.get("estimated_experience_years"),
            completeness=raw.get("profile_completeness"),
            resume_chars_original=len(resume_text or ""),
            resume_chars_compact=len(compact_resume_text),
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            cache_read_tokens=response.cache_read_tokens,
        )

        return _parse_profile(raw, resume_hash)

    @staticmethod
    def _fallback_profile(resume_hash: str) -> CandidateProfile:
        """Perfil mínimo e seguro quando a IA não está disponível."""
        return CandidateProfile(
            detected_level="undefined",
            estimated_experience_years=0.0,
            current_role=None,
            professional_area="other",
            experiences=[],
            evidenced_skills=[],
            tools_and_systems=[],
            capabilities=[],
            education=[],
            certifications=[],
            leadership_evidence=[],
            business_impact_evidence=[],
            profile_completeness=0.0,
            confidence="low",
            resume_hash=resume_hash,
        )


# ---------------------------------------------------------------------------
# Pure parsing helpers
# ---------------------------------------------------------------------------

def _hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _safe_prompt_format(template: str, **kwargs: str) -> str:
    """
    Format template preserving literal JSON braces.
    Escapes all braces first, then restores known placeholders.
    """
    escaped = template.replace("{", "{{").replace("}", "}}")
    for key in kwargs:
        escaped = escaped.replace(f"{{{{{key}}}}}", f"{{{key}}}")
    return escaped.format(**kwargs)


def _build_resume_ai_context(resume_text: str) -> str:
    lines = [line.strip() for line in (resume_text or "").splitlines() if line.strip()]
    current_role = _extract_current_role(lines)
    level_hint = _extract_level_hint(resume_text)
    skill_items = _extract_compact_skill_items(lines)
    experience_lines = _extract_relevant_experience_lines(lines)

    sections = [
        f"cargo_atual: {current_role or 'nao identificado'}",
        f"nivel: {level_hint or 'undefined'}",
        "skills:",
        ", ".join(skill_items) if skill_items else "nao identificado",
        "experiencias_relevantes:",
    ]
    sections.extend(experience_lines or ["nao identificado"])
    return "\n".join(sections)


def _extract_current_role(lines: list[str]) -> str | None:
    for line in lines[:10]:
        if len(line) > _MAX_COMPACT_ROLE_CHARS:
            continue
        if _is_noise_line(line):
            continue
        if re.search(r"\b\d{4}\b", line):
            continue
        if any(hint in _normalize_token(line) for hint in _ROLE_HINTS):
            return line
    for line in lines[:10]:
        if len(line) > _MAX_COMPACT_ROLE_CHARS:
            continue
        if _is_noise_line(line):
            continue
        if re.search(r"\b\d{4}\b", line):
            continue
        return line
    return None


def _extract_level_hint(text: str) -> str | None:
    for pattern, level in _LEVEL_PATTERNS:
        if re.search(pattern, text or ""):
            return level
    return None


def _extract_compact_skill_items(lines: list[str]) -> list[str]:
    section_candidates: list[str] = []
    fallback_candidates: list[str] = []
    for line in lines:
        if _is_noise_line(line):
            continue
        normalized = line.lower()
        if any(hint in normalized for hint in _SKILL_SECTION_HINTS):
            section_candidates.extend(_split_skill_like_line(line))
            continue
        if "," in line:
            items = _split_skill_like_line(line)
            if len(items) >= 3:
                fallback_candidates.extend(item for item in items if _looks_skill_specific(item))

    candidates = section_candidates or fallback_candidates

    deduped: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        if not _is_valid_skill_item(item):
            continue
        normalized = _normalize_token(item)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(item)
        if len(deduped) >= _MAX_COMPACT_SKILLS:
            break
    return deduped


def _extract_relevant_experience_lines(lines: list[str]) -> list[str]:
    selected: list[str] = []
    active_section = False
    for line in lines:
        if _is_noise_line(line):
            continue
        normalized = line.lower()
        if any(hint in normalized for hint in _EXPERIENCE_SECTION_HINTS):
            active_section = True
            if line not in selected:
                selected.append(line)
            continue
        if re.search(r"\b(19|20)\d{2}\b", line) or re.search(r"(?i)\b(atual|current|present)\b", line):
            if line not in selected:
                selected.append(line)
            continue
        if active_section and len(line) <= 180:
            if line not in selected:
                selected.append(line)
        if len(selected) >= _MAX_COMPACT_EXPERIENCES:
            break

    if not selected:
        selected = [line for line in lines if not _is_noise_line(line)][: min(4, len(lines))]
    return selected[:_MAX_COMPACT_EXPERIENCES]


def _split_skill_like_line(line: str) -> list[str]:
    cleaned = re.sub(r"(?i)^(skills?|habilidades?|compet[eê]ncias?|stack|tecnologias?|ferramentas?)\s*[:\-]\s*", "", line).strip()
    items = re.split(r"[,\|;/•·]", cleaned)
    return [item.strip() for item in items if 1 < len(item.strip()) <= 40]


def _normalize_token(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _normalize_for_compare(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_only = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", ascii_only.strip().lower())


def _looks_like_name_candidate(value: str) -> bool:
    normalized = _normalize_for_compare(value)
    if not normalized:
        return False
    if any(keyword in normalized for keyword in _SKILL_KEYWORDS):
        return False
    if normalized in _COMMON_SECTION_HEADINGS:
        return False
    if any(hint in normalized for hint in _CONTACT_HINTS):
        return False
    if any(char.isdigit() for char in value):
        return False
    words = [word for word in re.split(r"\s+", value) if word]
    if not 2 <= len(words) <= 4:
        return False
    connectors = {"de", "da", "das", "do", "dos", "e"}
    valid_words = 0
    for word in words:
        cleaned = re.sub(r"[^A-Za-zÀ-ÿ'-]", "", word)
        if not cleaned:
            continue
        lowered = _normalize_for_compare(cleaned)
        if lowered in connectors:
            continue
        if not cleaned[:1].isalpha():
            return False
        if not cleaned[:1].isupper():
            return False
        valid_words += 1
    return valid_words >= 2


def _looks_like_location_line(value: str) -> bool:
    normalized = _normalize_for_compare(value)
    if not normalized:
        return False
    parts = [part.strip() for part in re.split(r"[,/|-]", value) if part.strip()]
    normalized_parts = [_normalize_for_compare(part) for part in parts]
    has_region_hint = any(part in _COUNTRY_OR_STATE_HINTS for part in normalized_parts) or any(
        part.upper() in _STATE_ABBRS for part in parts
    )
    has_skill_hint = any(part in _SKILL_KEYWORDS for part in normalized_parts)
    return bool(has_region_hint and not has_skill_hint)


def _is_noise_line(value: str) -> bool:
    normalized = _normalize_for_compare(value)
    if not normalized:
        return True
    if normalized in _COMMON_SECTION_HEADINGS:
        return True
    if normalized.rstrip(":") in _COMMON_SECTION_HEADINGS:
        return True
    if any(hint in normalized for hint in _CONTACT_HINTS):
        return True
    if _PHONE_RE.search(value) or _EMAIL_RE.search(value):
        return True
    if "[telefone_removido]" in normalized or "[email_removido]" in normalized:
        return True
    if _looks_like_location_line(value):
        return True
    return False


def _is_valid_skill_item(value: str) -> bool:
    normalized = _normalize_for_compare(value)
    if not normalized:
        return False
    if normalized in _COMMON_SECTION_HEADINGS:
        return False
    if normalized in _SKILL_LABEL_HINTS:
        return False
    if any(hint in normalized for hint in _CONTACT_HINTS):
        return False
    if _looks_like_location_line(value):
        return False
    if _looks_like_name_candidate(value):
        return False
    if len(value.split()) > _MAX_COMPACT_SKILL_WORDS:
        return False
    return True


def _looks_skill_specific(value: str) -> bool:
    normalized = _normalize_for_compare(value)
    if not normalized:
        return False
    return any(keyword in normalized for keyword in _SKILL_KEYWORDS) or bool(
        re.search(r"[+#/.]", value)
    )


def _parse_profile(raw: dict[str, Any], resume_hash: str) -> CandidateProfile:
    detected_level = _safe_str(raw.get("detected_level"), "undefined")

    experiences: list[Experience] = []
    for e in (raw.get("experiences") or []):
        company = (e.get("company") or "").strip()
        role = (e.get("role") or "").strip()
        if not company or not role:
            continue
        experiences.append(
            Experience(
                company=company,
                role=role,
                duration_months=_safe_int(e.get("duration_months")),
                is_current=_safe_bool(e.get("is_current"), False),
                is_leadership=_safe_bool(e.get("is_leadership"), False),
                key_activities=_safe_list(e.get("key_activities")),
                technologies_used=_safe_list(e.get("technologies_used")),
            )
        )

    evidenced_skills: list[EvidencedSkill] = []
    for s in (raw.get("evidenced_skills") or []):
        name = (s.get("name") or "").strip()
        evidence_text = (s.get("evidence_text") or "").strip()
        if not name or not evidence_text:
            continue
        confidence = _safe_str(s.get("confidence"), "medium")
        if confidence not in VALID_CONFIDENCE:
            confidence = "medium"
        source = _safe_str(s.get("source"), "experience")
        if source not in VALID_SOURCES:
            source = "experience"

        evidenced_skills.append(
            EvidencedSkill(
                name=name,
                evidence_text=evidence_text,
                confidence=confidence,
                years_evidenced=_safe_float(s.get("years_evidenced")),
                source=source,
            )
        )

    capabilities: list[CandidateCapability] = []
    for c in (raw.get("capabilities") or []):
        name = (c.get("name") or "").strip()
        evidence_text = (c.get("evidence_text") or "").strip()
        if not name or not evidence_text:
            continue
        strength = _safe_str(c.get("strength"), "medium")
        if strength not in VALID_STRENGTHS:
            strength = "medium"
        confidence = _safe_str(c.get("confidence"), "medium")
        if confidence not in VALID_CONFIDENCE:
            confidence = "medium"
        source = _safe_str(c.get("source"), "experience")
        if source not in VALID_SOURCES:
            source = "experience"

        capabilities.append(
            CandidateCapability(
                name=name,
                evidence_text=evidence_text,
                strength=strength,
                source=source,
                confidence=confidence,
            )
        )

    education: list[EducationEntry] = []
    for e in (raw.get("education") or []):
        level = _safe_str(e.get("level"), "none")
        valid_levels = {"none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"}
        if level not in valid_levels:
            level = "none"

        education.append(
            EducationEntry(
                level=level,
                field=(e.get("field") or "").strip() or None,
                institution=(e.get("institution") or "").strip() or None,
                graduation_year=_safe_int(e.get("graduation_year")),
                is_completed=_safe_bool(e.get("is_completed"), False),
            )
        )

    certifications: list[CertificationEntry] = []
    for c in (raw.get("certifications") or []):
        name = (c.get("name") or "").strip()
        if not name:
            continue
        certifications.append(
            CertificationEntry(
                name=name,
                issuer=(c.get("issuer") or "").strip() or None,
                obtained_date=(c.get("obtained_date") or "").strip() or None,
                is_active=_safe_bool(c.get("is_active"), True),
            )
        )

    confidence = _safe_str(raw.get("confidence"), "medium")
    if confidence not in VALID_CONFIDENCE:
        confidence = "medium"

    return CandidateProfile(
        detected_level=detected_level,
        estimated_experience_years=_safe_float(raw.get("estimated_experience_years")) or 0.0,
        current_role=(raw.get("current_role") or "").strip() or None,
        professional_area=_safe_str(raw.get("professional_area"), "other"),
        experiences=experiences,
        evidenced_skills=evidenced_skills,
        tools_and_systems=_safe_list(raw.get("tools_and_systems")),
        capabilities=capabilities,
        education=education,
        certifications=certifications,
        leadership_evidence=_safe_list(raw.get("leadership_evidence")),
        business_impact_evidence=_safe_list(raw.get("business_impact_evidence")),
        profile_completeness=_clamp(float(raw.get("profile_completeness") or 0.5), 0.0, 1.0),
        confidence=confidence,
        resume_hash=resume_hash,
    )


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _safe_str(value: Any, default: str) -> str:
    if value is None:
        return default
    s = str(value).strip()
    return s if s else default


def _safe_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    s = str(value).lower().strip()
    return s in {"true", "1", "yes"}


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _safe_list(value: Any) -> list[str]:
    if not value or not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]
