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
        prompt = _prompt.USER_PROMPT_TEMPLATE.format(resume_text=resume_text)
        request = AIAnalysisRequest(
            resume_text=resume_text,
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
