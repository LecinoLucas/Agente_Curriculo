"""
EvidenceMatcherService — Fase 4.

Compara JobProfile e CandidateProfile e gera um EvidenceMapping estruturado.
Esta camada não altera ranking final, não substitui o JobCompatibilityCalculator
e não calcula score agregado. Ela existe para preparar o AdaptiveScorer da fase
seguinte com evidências e lacunas mais bem organizadas.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from src.application.ports.ai_service import AIAnalysisRequest, AIService
from src.domain.value_objects.candidate_profile import CandidateProfile
from src.domain.value_objects.evidence_mapping import (
    EvidenceMapping,
    RequirementMatch,
    VALID_CONFIDENCE,
    VALID_EVIDENCE_STRENGTHS,
    VALID_MATCH_STATUSES,
    VALID_MATCH_TYPES,
    VALID_REQUIREMENT_TYPES,
)
from src.domain.value_objects.job_profile import JobProfile
from src.infrastructure.ai.prompts import evidence_matcher as _prompt
from src.infrastructure.ai.response_parser import extract_json

logger = structlog.get_logger(__name__)

_DEFAULT_TTL_SECONDS: int = 86_400


class InMemoryEvidenceMappingCache:
    """Cache em memória para desenvolvimento e testes."""

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


class EvidenceMatcherService:
    """
    Compara perfis estruturados de vaga e candidato para produzir um EvidenceMapping.
    """

    def __init__(
        self,
        ai_service: AIService,
        cache: InMemoryEvidenceMappingCache | None = None,
    ) -> None:
        self._ai = ai_service
        self._cache = cache if cache is not None else InMemoryEvidenceMappingCache()

    async def generate_mapping(self, job_profile: JobProfile, candidate_profile: CandidateProfile) -> EvidenceMapping:
        cache_key = _cache_key(job_profile.description_hash, candidate_profile.resume_hash)
        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.info(
                "evidence_mapping_cache_hit",
                job_profile_hash=job_profile.description_hash,
                candidate_profile_hash=candidate_profile.resume_hash,
            )
            return EvidenceMapping.from_dict(cached)

        request = self._build_request(job_profile, candidate_profile)

        try:
            response = await self._ai.analyze(request)
            raw = extract_json(response.content)
            mapping = _parse_mapping(
                raw,
                job_profile_hash=job_profile.description_hash,
                candidate_profile_hash=candidate_profile.resume_hash,
            )
            logger.info(
                "evidence_mapping_generated",
                job_profile_hash=job_profile.description_hash,
                candidate_profile_hash=candidate_profile.resume_hash,
                requirement_matches=len(mapping.requirement_matches),
                unmapped_critical_requirements=len(mapping.unmapped_critical_requirements),
                candidate_extra_strengths=len(mapping.candidate_extra_strengths),
                risk_points=len(mapping.risk_points),
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
                cache_read_tokens=response.cache_read_tokens,
            )
        except Exception as exc:
            logger.warning(
                "evidence_mapping_failed",
                job_profile_hash=job_profile.description_hash,
                candidate_profile_hash=candidate_profile.resume_hash,
                error=str(exc),
            )
            mapping = self._fallback_mapping(job_profile.description_hash, candidate_profile.resume_hash)
            logger.info(
                "evidence_mapping_fallback_used",
                job_profile_hash=job_profile.description_hash,
                candidate_profile_hash=candidate_profile.resume_hash,
            )

        self._cache.set(cache_key, mapping.to_dict())
        return mapping

    def invalidate(self, job_profile_hash: str, candidate_profile_hash: str) -> None:
        self._cache.invalidate(_cache_key(job_profile_hash, candidate_profile_hash))

    def _build_request(self, job_profile: JobProfile, candidate_profile: CandidateProfile) -> AIAnalysisRequest:
        prompt = _prompt.USER_PROMPT_TEMPLATE.format(
            job_profile_json=json.dumps(job_profile.to_dict(), ensure_ascii=False, sort_keys=True, indent=2),
            candidate_profile_json=json.dumps(candidate_profile.to_dict(), ensure_ascii=False, sort_keys=True, indent=2),
        )
        return AIAnalysisRequest(
            resume_text="",
            prompt_template=prompt,
            system_prompt=_prompt.SYSTEM_PROMPT,
            max_tokens=3072,
            temperature=0.0,
        )

    @staticmethod
    def _fallback_mapping(job_profile_hash: str, candidate_profile_hash: str) -> EvidenceMapping:
        return EvidenceMapping(
            job_profile_hash=job_profile_hash,
            candidate_profile_hash=candidate_profile_hash,
            requirement_matches=[],
            overall_evidence_strength="none",
            confidence="low",
            unmapped_critical_requirements=[],
            candidate_extra_strengths=[],
            risk_points=[],
        )


def _cache_key(job_profile_hash: str, candidate_profile_hash: str) -> str:
    return f"{job_profile_hash}:{candidate_profile_hash}"


def _parse_mapping(raw: dict[str, Any], job_profile_hash: str, candidate_profile_hash: str) -> EvidenceMapping:
    requirement_matches: list[RequirementMatch] = []
    for match in raw.get("requirement_matches") or []:
        requirement = (match.get("requirement") or "").strip()
        if not requirement:
            continue

        requirement_type = _safe_enum(match.get("requirement_type"), VALID_REQUIREMENT_TYPES, "capability")
        match_status = _safe_enum(match.get("match_status"), VALID_MATCH_STATUSES, "unclear")
        match_type = _safe_enum(match.get("match_type"), VALID_MATCH_TYPES, "absent")
        evidence_quotes = _safe_list(match.get("evidence_quotes"))
        evidence_strength = _safe_enum(match.get("evidence_strength"), VALID_EVIDENCE_STRENGTHS, "none")
        confidence = _safe_enum(match.get("confidence"), VALID_CONFIDENCE, "low")
        score_hint = _safe_float(match.get("score_hint"), 0.0, 0.0, 100.0)
        explanation = (match.get("explanation") or "").strip()

        requirement_matches.append(
            RequirementMatch(
                requirement=requirement,
                requirement_type=requirement_type,
                match_status=match_status,
                match_type=match_type,
                evidence_quotes=evidence_quotes,
                evidence_strength=evidence_strength,
                confidence=confidence,
                score_hint=score_hint,
                explanation=explanation,
            )
        )

    return EvidenceMapping(
        job_profile_hash=job_profile_hash,
        candidate_profile_hash=candidate_profile_hash,
        requirement_matches=requirement_matches,
        overall_evidence_strength=_safe_enum(
            raw.get("overall_evidence_strength"),
            VALID_EVIDENCE_STRENGTHS,
            "none",
        ),
        confidence=_safe_enum(raw.get("confidence"), VALID_CONFIDENCE, "low"),
        unmapped_critical_requirements=_safe_list(raw.get("unmapped_critical_requirements")),
        candidate_extra_strengths=_safe_list(raw.get("candidate_extra_strengths")),
        risk_points=_safe_list(raw.get("risk_points")),
    )


def _safe_enum(value: Any, valid: frozenset[str], default: str) -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text in valid else default


def _safe_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    deduped: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item).strip()
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(text)
    return deduped


def _safe_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))
