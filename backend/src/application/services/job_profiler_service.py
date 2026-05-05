"""
JobProfilerService — Gera perfis semânticos de vagas a partir de descrições livres.

Fluxo:
  1. Calcula hash do estado relevante da vaga (texto + senioridade + skills vinculadas).
  2. Se hit no cache → retorna JobProfile imediatamente.
  3. Se miss e IA disponível → chama IA com contexto textual + skills manuais.
  4. Mescla o retorno com as skills vinculadas, que têm precedência.
  5. Se IA falhar ou não existir → gera perfil determinístico seguro.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

import structlog

from src.application.ports.ai_service import AIAnalysisRequest, AIService
from src.application.services.extraction_fallbacks import (
    infer_job_nice_to_have_skills,
    infer_job_required_skills,
)
from src.application.services.skill_normalizer_service import contains_whole_phrase, normalize_skill_text
from src.domain.value_objects.job_profile import (
    AREA_WEIGHTS,
    DEFAULT_WEIGHTS,
    VALID_AREAS,
    JobProfile,
    JobRequirement,
)
from src.infrastructure.ai.prompts import job_profiler as _prompt
from src.infrastructure.ai.response_parser import extract_json

logger = structlog.get_logger(__name__)

_DEFAULT_TTL_SECONDS: int = 86_400
_MAX_AI_REQUIRED_SKILLS = 10
_MAX_AI_OPTIONAL_SKILLS = 6
_MAX_AI_TEXTUAL_REQUIREMENTS = 6

_AREA_KEYWORDS: dict[str, set[str]] = {
    "technology": {"python", "backend", "frontend", "api", "fastapi", "react", "software", "devops"},
    "data": {"sql", "power bi", "bi", "dashboard", "etl", "elt", "pipeline", "analytics", "dados"},
    "administrative": {"administrativo", "office", "excel", "backoffice", "assistente", "secretariado"},
    "accounting": {"contabil", "contábil", "fiscal", "tribut", "sped", "ecd", "ecf", "crc"},
    "financial": {"financeiro", "fp&a", "tesouraria", "forecast", "budget", "controladoria"},
    "commercial": {"vendas", "comercial", "cliente", "negociacao", "negociação", "sdr", "account"},
    "operational": {"operacional", "logistica", "logística", "supply", "processos", "manutencao", "manutenção"},
    "leadership": {"lideranca", "liderança", "gestao", "gestão", "gerencia", "gerência", "coordenação", "coordenacao"},
}

_EXPLICIT_AREA_MAP: dict[str, str] = {
    "tecnologia": "technology",
    "dados": "data",
    "financeiro": "financial",
    "fiscal": "accounting",
    "contabil": "accounting",
    "contábil": "accounting",
    "administrativo": "administrative",
    "comercial": "commercial",
    "operacional": "operational",
    "rh": "administrative",
    "lideranca": "leadership",
    "liderança": "leadership",
}

_CAPABILITY_HINTS: dict[str, str] = {
    "comunic": "comunicação",
    "organiz": "organização",
    "lider": "liderança",
    "atend": "atendimento",
    "suporte": "suporte técnico",
    "stakeholder": "gestão de stakeholders",
    "autonom": "autonomia",
    "analit": "análise crítica",
}


@dataclass(slots=True, frozen=True)
class StructuredJobSkill:
    name: str
    normalized_name: str
    category: str | None = None
    aliases: list[str] = field(default_factory=list)
    is_mandatory: bool = False
    minimum_level: str | None = None
    minimum_years: float | None = None
    weight: float = 1.0


@dataclass(slots=True, frozen=True)
class JobProfileInput:
    title: str = ""
    description: str = ""
    requirements: str | None = None
    seniority_level: str | None = None
    minimum_years_experience: float | None = None
    minimum_education_level: str | None = None
    job_area: str | None = None
    responsibilities: str | None = None
    experience_context: str | None = None
    behavioral_requirements: tuple[str, ...] = ()
    priority: str | None = None
    linked_skills: tuple[StructuredJobSkill, ...] = ()

    @property
    def combined_text(self) -> str:
        return build_job_profile_text(
            self.title,
            self.description,
            self.requirements,
            job_area=self.job_area,
            responsibilities=self.responsibilities,
            experience_context=self.experience_context,
            behavioral_requirements=self.behavioral_requirements,
            priority=self.priority,
        )

    @property
    def description_hash(self) -> str:
        return build_job_profile_hash(
            title=self.title,
            description=self.description,
            requirements=self.requirements,
            seniority_level=self.seniority_level,
            minimum_years_experience=self.minimum_years_experience,
            minimum_education_level=self.minimum_education_level,
            job_area=self.job_area,
            responsibilities=self.responsibilities,
            experience_context=self.experience_context,
            behavioral_requirements=self.behavioral_requirements,
            priority=self.priority,
            linked_skills=self.linked_skills,
        )


class InMemoryJobProfileCache:
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


class JobProfilerService:
    def __init__(
        self,
        ai_service: AIService | None,
        cache: InMemoryJobProfileCache | None = None,
    ) -> None:
        self._ai = ai_service
        self._cache = cache if cache is not None else InMemoryJobProfileCache()

    async def generate_profile(
        self,
        job_description: str,
        *,
        title: str | None = None,
        requirements: str | None = None,
        seniority_level: str | None = None,
        minimum_years_experience: float | None = None,
        minimum_education_level: str | None = None,
        job_area: str | None = None,
        responsibilities: str | None = None,
        experience_context: str | None = None,
        behavioral_requirements: list[str] | None = None,
        priority: str | None = None,
        linked_skills: list[StructuredJobSkill] | None = None,
    ) -> JobProfile:
        source = JobProfileInput(
            title=_clean_text(title),
            description=_clean_text(job_description),
            requirements=_clean_text(requirements) or None,
            seniority_level=_clean_text(seniority_level) or None,
            minimum_years_experience=_safe_float(minimum_years_experience, default=None),
            minimum_education_level=_clean_text(minimum_education_level) or None,
            job_area=_clean_text(job_area) or None,
            responsibilities=_clean_text(responsibilities) or None,
            experience_context=_clean_text(experience_context) or None,
            behavioral_requirements=tuple(_dedupe([str(item) for item in (behavioral_requirements or [])])),
            priority=_clean_text(priority) or None,
            linked_skills=tuple(linked_skills or ()),
        )
        desc_hash = source.description_hash

        if not source.combined_text.strip() and not source.linked_skills:
            return build_deterministic_job_profile(source)

        cached = self._cache.get(desc_hash)
        if cached is not None:
            logger.info("job_profiler.cache_hit", hash=desc_hash)
            return JobProfile.from_dict(cached)

        logger.info("job_profiler.cache_miss", hash=desc_hash)

        if self._ai is None:
            profile = ensure_textual_skill_coverage(
                build_deterministic_job_profile(source),
                source,
            )
            self._cache.set(desc_hash, profile.to_dict())
            return profile

        try:
            ai_profile = await self._call_ai(source)
            profile = merge_manual_skills_into_profile(ai_profile, source)
        except Exception as exc:
            logger.warning(
                "job_profiler.ai_failed",
                hash=desc_hash,
                error=str(exc),
            )
            profile = build_deterministic_job_profile(source)

        profile = ensure_textual_skill_coverage(profile, source)

        self._cache.set(desc_hash, profile.to_dict())
        return profile

    def invalidate(self, job_description: str) -> None:
        self._cache.invalidate(_hash(job_description))
        self._cache.invalidate(
            build_job_profile_hash(
                title="",
                description=job_description,
                requirements=None,
                seniority_level=None,
                minimum_years_experience=None,
                minimum_education_level=None,
                job_area=None,
                responsibilities=None,
                experience_context=None,
                behavioral_requirements=(),
                priority=None,
                linked_skills=(),
            )
        )

    async def _call_ai(self, source: JobProfileInput) -> JobProfile:
        compact_job_context = build_job_profile_ai_context(source)
        prompt = _safe_prompt_format(
            _prompt.USER_PROMPT_TEMPLATE,
            job_description=compact_job_context,
            structured_skills_context=_format_structured_skills_context(source.linked_skills),
        )
        request = AIAnalysisRequest(
            resume_text="",
            prompt_template=prompt,
            system_prompt=_prompt.SYSTEM_PROMPT,
            max_tokens=2048,
            temperature=0.1,
        )
        response = await self._ai.analyze(request)
        raw = extract_json(response.content)

        logger.info(
            "job_profiler.ai_response",
            hash=source.description_hash,
            area=raw.get("area"),
            target_level=raw.get("target_level"),
            completeness=raw.get("job_completeness_score"),
            job_chars_original=len(source.combined_text),
            job_chars_compact=len(compact_job_context),
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            cache_read_tokens=response.cache_read_tokens,
        )

        return _parse_profile(raw, source.description_hash)


def job_skill_from_row(row: Any) -> StructuredJobSkill:
    link = getattr(row, "JobRequiredSkillModel", row)
    return StructuredJobSkill(
        name=_clean_text(getattr(row, "skill_name", "")),
        normalized_name=_clean_text(getattr(row, "skill_normalized_name", ""))
        or normalize_skill_text(getattr(row, "skill_name", "")),
        category=_clean_text(getattr(row, "skill_category", "")) or None,
        aliases=_safe_list(getattr(row, "skill_aliases", [])),
        is_mandatory=bool(getattr(link, "is_mandatory", False)),
        minimum_level=_clean_text(getattr(link, "minimum_level", "")) or None,
        minimum_years=_safe_float(getattr(link, "minimum_years", None), default=None),
        weight=_safe_float(getattr(link, "weight", 1.0), default=1.0) or 1.0,
    )


def build_job_profile_text(
    title: str | None,
    description: str | None,
    requirements: str | None = None,
    *,
    job_area: str | None = None,
    responsibilities: str | None = None,
    experience_context: str | None = None,
    behavioral_requirements: tuple[str, ...] | list[str] | None = None,
    priority: str | None = None,
) -> str:
    sections: list[str] = []
    title_text = _clean_text(title)
    description_text = _clean_text(description)
    requirements_text = _clean_text(requirements)
    area_text = _clean_text(job_area)
    responsibilities_text = _clean_text(responsibilities)
    experience_context_text = _clean_text(experience_context)
    priority_text = _clean_text(priority)
    behavioral_text = ", ".join(_dedupe(list(behavioral_requirements or [])))
    if title_text:
        sections.append(f"Título: {title_text}")
    if area_text:
        sections.append(f"Área da vaga: {area_text}")
    if priority_text:
        sections.append(f"Prioridade: {priority_text}")
    if description_text:
        sections.append(f"Descrição:\n{description_text}")
    if requirements_text:
        sections.append(f"Requisitos:\n{requirements_text}")
    if responsibilities_text:
        sections.append(f"Responsabilidades principais:\n{responsibilities_text}")
    if experience_context_text:
        sections.append(f"Contexto de experiência esperado:\n{experience_context_text}")
    if behavioral_text:
        sections.append(f"Requisitos comportamentais:\n{behavioral_text}")
    return "\n\n".join(sections)


def build_job_profile_ai_context(source: JobProfileInput) -> str:
    mandatory_skills = [
        skill.name for skill in source.linked_skills if skill.is_mandatory and _clean_text(skill.name)
    ][: _MAX_AI_REQUIRED_SKILLS]
    optional_skills = [
        skill.name for skill in source.linked_skills if not skill.is_mandatory and _clean_text(skill.name)
    ][: _MAX_AI_OPTIONAL_SKILLS]
    textual_requirements = _extract_textual_requirements(source)[:_MAX_AI_TEXTUAL_REQUIREMENTS]

    sections: list[str] = []
    if source.title:
        sections.append(f"titulo: {source.title}")
    if source.job_area:
        sections.append(f"area: {source.job_area}")
    if source.seniority_level:
        sections.append(f"senioridade: {source.seniority_level}")
    if source.minimum_years_experience is not None:
        sections.append(f"experiencia_minima_anos: {source.minimum_years_experience:g}")
    if source.minimum_education_level:
        sections.append(f"educacao_minima: {source.minimum_education_level}")
    sections.append(
        "skills_obrigatorias: "
        + (", ".join(mandatory_skills) if mandatory_skills else "nao identificado")
    )
    if optional_skills:
        sections.append("skills_desejaveis: " + ", ".join(optional_skills))
    if textual_requirements:
        sections.append("requisitos_textuais: " + ", ".join(textual_requirements))
    return "\n".join(sections)


def build_job_profile_hash(
    *,
    title: str | None,
    description: str | None,
    requirements: str | None,
    seniority_level: str | None,
    minimum_years_experience: float | None,
    minimum_education_level: str | None,
    job_area: str | None,
    responsibilities: str | None,
    experience_context: str | None,
    behavioral_requirements: tuple[str, ...] | list[str] | None,
    priority: str | None,
    linked_skills: tuple[StructuredJobSkill, ...] | list[StructuredJobSkill] | None,
) -> str:
    payload = {
        "title": _clean_text(title),
        "description": _clean_text(description),
        "requirements": _clean_text(requirements),
        "seniority_level": _clean_text(seniority_level),
        "minimum_years_experience": minimum_years_experience,
        "minimum_education_level": _clean_text(minimum_education_level),
        "job_area": _clean_text(job_area),
        "responsibilities": _clean_text(responsibilities),
        "experience_context": _clean_text(experience_context),
        "behavioral_requirements": _dedupe(list(behavioral_requirements or [])),
        "priority": _clean_text(priority),
        "linked_skills": [
            {
                "name": skill.name,
                "normalized_name": skill.normalized_name,
                "category": skill.category,
                "aliases": sorted(skill.aliases),
                "is_mandatory": skill.is_mandatory,
                "minimum_level": skill.minimum_level,
                "minimum_years": skill.minimum_years,
                "weight": round(float(skill.weight or 1.0), 2),
            }
            for skill in sorted(linked_skills or (), key=lambda item: (not item.is_mandatory, item.normalized_name, item.name))
        ],
    }
    return _hash(json.dumps(payload, sort_keys=True, ensure_ascii=True))


def build_deterministic_job_profile(source: JobProfileInput) -> JobProfile:
    combined_text = source.combined_text
    area = _infer_job_area(source)
    target_level = _normalize_target_level(source.seniority_level)
    critical_requirements: list[JobRequirement] = []
    desirable_requirements: list[JobRequirement] = []
    required_tools: list[str] = []
    required_capabilities = _extract_capabilities(combined_text, source.behavioral_requirements)

    seen_requirements: set[str] = set()
    seen_tools: set[str] = set()

    for skill in source.linked_skills:
        key = _skill_key(skill.name or skill.normalized_name)
        if not key:
            continue
        requirement = _job_requirement_from_skill(skill)
        if skill.is_mandatory:
            critical_requirements.append(requirement)
        else:
            desirable_requirements.append(requirement)
        seen_requirements.update(_skill_keys_for_matching(skill))

        if _should_be_required_tool(skill):
            tool_key = _skill_key(skill.name)
            if tool_key not in seen_tools:
                required_tools.append(skill.name)
                seen_tools.add(tool_key)

    if not source.linked_skills:
        for candidate in _extract_textual_requirements(source):
            key = _skill_key(candidate)
            if not key or key in seen_requirements:
                continue
            critical_requirements.append(
                JobRequirement(
                    name=candidate,
                    description=f"Requisito textual extraído da vaga: {candidate}",
                    is_mandatory=True,
                    importance_weight=1.1,
                    evidence_examples=[candidate],
                )
            )
            seen_requirements.add(key)

    if not required_tools:
        for candidate in _extract_tool_candidates(source):
            key = _skill_key(candidate)
            if not key or key in seen_tools:
                continue
            required_tools.append(candidate)
            seen_tools.add(key)

    responsibilities = _extract_responsibilities(source)
    seniority_signals = _dedupe(
        [
            source.seniority_level or "",
            f"{int(source.minimum_years_experience)}+ anos" if source.minimum_years_experience else "",
            source.title,
            source.priority or "",
        ]
    )
    completeness = _compute_completeness(source)
    confidence = _confidence_from_completeness(completeness)

    return JobProfile(
        area=area,
        target_level=target_level,
        main_mission=_main_mission(source),
        critical_requirements=critical_requirements,
        desirable_requirements=desirable_requirements,
        responsibilities=responsibilities,
        required_tools=required_tools,
        required_capabilities=required_capabilities,
        seniority_signals=seniority_signals,
        adaptive_weights=dict(AREA_WEIGHTS.get(area, DEFAULT_WEIGHTS)),
        job_completeness_score=completeness,
        confidence=confidence,
        description_hash=source.description_hash,
    )


def merge_manual_skills_into_profile(profile: JobProfile, source: JobProfileInput) -> JobProfile:
    critical = list(profile.critical_requirements)
    desirable = list(profile.desirable_requirements)
    required_tools = list(profile.required_tools)
    required_capabilities = list(profile.required_capabilities)

    critical_index = _requirement_index(critical)
    desirable_index = _requirement_index(desirable)
    tool_keys = {_skill_key(item) for item in required_tools}

    for skill in source.linked_skills:
        skill_keys = _skill_keys_for_matching(skill)
        target_list = critical if skill.is_mandatory else desirable
        target_index = critical_index if skill.is_mandatory else desirable_index
        opposite_list = desirable if skill.is_mandatory else critical
        opposite_index = desirable_index if skill.is_mandatory else critical_index

        matched_idx = _find_requirement_match(target_index, skill_keys)
        if matched_idx is None:
            opposite_idx = _find_requirement_match(opposite_index, skill_keys)
            if opposite_idx is not None and skill.is_mandatory:
                requirement = opposite_list.pop(opposite_idx)
                critical.append(
                    JobRequirement(
                        name=skill.name,
                        description=requirement.description or _skill_description(skill),
                        is_mandatory=True,
                        importance_weight=max(1.2, requirement.importance_weight, _mandatory_weight(skill)),
                        evidence_examples=_dedupe(requirement.evidence_examples + [skill.name]),
                    )
                )
                critical_index = _requirement_index(critical)
                desirable_index = _requirement_index(desirable)
                continue

            target_list.append(_job_requirement_from_skill(skill))
            target_index = _requirement_index(target_list)
        else:
            current = target_list[matched_idx]
            target_list[matched_idx] = JobRequirement(
                name=skill.name,
                description=current.description or _skill_description(skill),
                is_mandatory=skill.is_mandatory or current.is_mandatory,
                importance_weight=max(current.importance_weight, _mandatory_weight(skill) if skill.is_mandatory else _optional_weight(skill)),
                evidence_examples=_dedupe(current.evidence_examples + [skill.name]),
            )
            target_index = _requirement_index(target_list)

        if _should_be_required_tool(skill):
            tool_key = _skill_key(skill.name)
            if tool_key not in tool_keys:
                required_tools.append(skill.name)
                tool_keys.add(tool_key)

    target_level = _normalize_target_level(source.seniority_level or profile.target_level)
    seniority_signals = _dedupe(
        list(profile.seniority_signals)
        + [source.seniority_level or "", f"{int(source.minimum_years_experience)}+ anos" if source.minimum_years_experience else ""]
    )
    completeness = min(0.95, max(profile.job_completeness_score, _compute_completeness(source)))
    confidence = profile.confidence
    if source.linked_skills and confidence == "low":
        confidence = "medium"

    return JobProfile(
        area=profile.area,
        target_level=target_level,
        main_mission=profile.main_mission or _main_mission(source),
        critical_requirements=critical,
        desirable_requirements=desirable,
        responsibilities=profile.responsibilities or _extract_responsibilities(source),
        required_tools=_dedupe(required_tools),
        required_capabilities=_dedupe(required_capabilities + _extract_capabilities(source.combined_text, source.behavioral_requirements)),
        seniority_signals=seniority_signals,
        adaptive_weights=dict(profile.adaptive_weights or AREA_WEIGHTS.get(profile.area, DEFAULT_WEIGHTS)),
        job_completeness_score=completeness,
        confidence=confidence,
        description_hash=source.description_hash,
    )


def ensure_textual_skill_coverage(profile: JobProfile, source: JobProfileInput) -> JobProfile:
    inferred_required = infer_job_required_skills(
        title=source.title,
        description=source.description,
        requirements=source.requirements,
        responsibilities=source.responsibilities,
        experience_context=source.experience_context,
    )
    inferred_optional = infer_job_nice_to_have_skills(
        title=source.title,
        description=source.description,
        requirements=source.requirements,
        responsibilities=source.responsibilities,
        experience_context=source.experience_context,
    )

    critical = list(profile.critical_requirements)
    desirable = list(profile.desirable_requirements)
    if inferred_required:
        critical = [
            item for item in critical
            if _looks_like_structured_requirement_name(item.name)
        ]
    if inferred_optional:
        desirable = [
            item for item in desirable
            if _looks_like_structured_requirement_name(item.name)
        ]
    required_tools = list(profile.required_tools)
    critical_keys = {_skill_key(item.name) for item in critical}
    desirable_keys = {_skill_key(item.name) for item in desirable}
    tool_keys = {_skill_key(item) for item in required_tools}

    for skill_name in inferred_required:
        key = _skill_key(skill_name)
        if not key or key in critical_keys or key in desirable_keys:
            continue
        critical.append(
            JobRequirement(
                name=skill_name,
                description=f"Requisito inferido do texto da vaga: {skill_name}",
                is_mandatory=True,
                importance_weight=1.2,
                evidence_examples=[skill_name],
            )
        )
        critical_keys.add(key)
        if key not in tool_keys:
            required_tools.append(skill_name)
            tool_keys.add(key)

    for skill_name in inferred_optional:
        key = _skill_key(skill_name)
        if not key or key in critical_keys or key in desirable_keys:
            continue
        desirable.append(
            JobRequirement(
                name=skill_name,
                description=f"Diferencial inferido do texto da vaga: {skill_name}",
                is_mandatory=False,
                importance_weight=0.6,
                evidence_examples=[skill_name],
            )
        )
        desirable_keys.add(key)
        if key not in tool_keys:
            required_tools.append(skill_name)
            tool_keys.add(key)

    return JobProfile(
        area=profile.area,
        target_level=profile.target_level,
        main_mission=profile.main_mission,
        critical_requirements=critical,
        desirable_requirements=desirable,
        responsibilities=list(profile.responsibilities),
        required_tools=_dedupe(required_tools),
        required_capabilities=list(profile.required_capabilities),
        seniority_signals=list(profile.seniority_signals),
        adaptive_weights=dict(profile.adaptive_weights),
        job_completeness_score=profile.job_completeness_score,
        confidence=profile.confidence,
        description_hash=profile.description_hash,
    )


def _looks_like_structured_requirement_name(value: str | None) -> bool:
    normalized = normalize_skill_text(value or "")
    if not normalized:
        return False
    if len(normalized) > 40 or len(normalized.split()) > 4:
        return False
    if any(marker in normalized for marker in (",", ";", ":", " ou ", " and ")):
        return False
    if any(phrase in normalized for phrase in ("utilizando", "experiencia em", "conhecimento em", "dominio de")):
        return False

    generic_tokens = {
        "requisitos",
        "requirement",
        "requirements",
        "description",
        "descricao",
        "responsibilities",
        "responsabilidades",
    }
    if any(token in normalized.split() for token in generic_tokens):
        return False
    return True


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


def _parse_profile(raw: dict[str, Any], desc_hash: str) -> JobProfile:
    area = raw.get("area", "other")
    if area not in VALID_AREAS:
        area = "other"

    weights = AREA_WEIGHTS.get(area, DEFAULT_WEIGHTS)

    critical: list[JobRequirement] = []
    for r in (raw.get("critical_requirements") or []):
        name = (r.get("name") or "").strip()
        if not name:
            continue
        critical.append(
            JobRequirement(
                name=name,
                description=(r.get("description") or "").strip(),
                is_mandatory=True,
                importance_weight=_clamp(float(r.get("importance_weight") or 1.0), 1.0, 2.0),
                evidence_examples=[
                    str(e).strip() for e in (r.get("evidence_examples") or []) if str(e).strip()
                ],
            )
        )

    desirable: list[JobRequirement] = []
    for r in (raw.get("desirable_requirements") or []):
        name = (r.get("name") or "").strip()
        if not name:
            continue
        desirable.append(
            JobRequirement(
                name=name,
                description=(r.get("description") or "").strip(),
                is_mandatory=False,
                importance_weight=_clamp(float(r.get("importance_weight") or 0.5), 0.1, 1.0),
                evidence_examples=[
                    str(e).strip() for e in (r.get("evidence_examples") or []) if str(e).strip()
                ],
            )
        )

    if not critical and not desirable:
        for r in (raw.get("requirements") or []):
            if not isinstance(r, dict):
                continue
            name = _clean_text(r.get("name"))
            if not name:
                continue
            is_mandatory = normalize_skill_text(r.get("priority") or "medium") == "high"
            evidence_hint = _clean_text(r.get("evidence_hint"))
            target = critical if is_mandatory else desirable
            target.append(
                JobRequirement(
                    name=name,
                    description=evidence_hint or _clean_text(r.get("type")) or name,
                    is_mandatory=is_mandatory,
                    importance_weight=1.2 if is_mandatory else 0.6,
                    evidence_examples=[evidence_hint] if evidence_hint else [],
                )
            )

    return JobProfile(
        area=area,
        target_level=_safe_str(raw.get("target_level"), "undefined"),
        main_mission=_safe_str(raw.get("main_mission"), ""),
        critical_requirements=critical,
        desirable_requirements=desirable,
        responsibilities=_safe_list(raw.get("responsibilities")),
        required_tools=_safe_list(raw.get("required_tools") or raw.get("tools")),
        required_capabilities=_safe_list(raw.get("required_capabilities")),
        seniority_signals=_safe_list(raw.get("seniority_signals")),
        adaptive_weights=weights,
        job_completeness_score=_clamp(float(raw.get("job_completeness_score") or 0.5), 0.0, 1.0),
        confidence=_safe_str(raw.get("confidence"), "medium"),
        description_hash=desc_hash,
    )


def _format_structured_skills_context(linked_skills: tuple[StructuredJobSkill, ...]) -> str:
    if not linked_skills:
        return "Nenhuma skill manual vinculada."

    lines: list[str] = []
    for skill in linked_skills:
        aliases = ", ".join(skill.aliases) if skill.aliases else "-"
        years = f"{skill.minimum_years:g}" if skill.minimum_years is not None else "-"
        level = skill.minimum_level or "-"
        importance = "mandatory" if skill.is_mandatory else "optional"
        lines.append(
            f"- name={skill.name}; category={skill.category or '-'}; aliases={aliases}; importance={importance}; level={level}; min_years={years}; weight={skill.weight:.2f}"
        )
    return "\n".join(lines)


def _extract_textual_requirements(source: JobProfileInput) -> list[str]:
    chunks = (
        _split_text(source.requirements)
        or _split_text(source.experience_context)
        or _split_text(source.description)
    )
    candidates: list[str] = []
    for chunk in chunks:
        normalized = normalize_skill_text(chunk)
        if len(normalized) < 4:
            continue
        if len(chunk) > 80:
            continue
        if any(token in normalized for token in ("respons", "atuar", "particip", "apoiar", "reportar")):
            continue
        candidates.append(chunk)
    return _dedupe(candidates[:6])


def _extract_tool_candidates(source: JobProfileInput) -> list[str]:
    raw = source.requirements or source.experience_context or source.description
    if not raw:
        return []
    candidates: list[str] = []
    for token in raw.replace("\n", ",").split(","):
        cleaned = token.strip(" -•\t\n")
        if not cleaned or len(cleaned) > 40:
            continue
        normalized = normalize_skill_text(cleaned)
        if any(marker in normalized for marker in ("python", "sql", "excel", "power bi", "react", "fastapi", "postgres", "mysql", "protheus", "totvs")):
            candidates.append(cleaned)
    return _dedupe(candidates[:8])


def _extract_capabilities(text: str, behavioral_requirements: tuple[str, ...] | list[str] | None = None) -> list[str]:
    normalized = normalize_skill_text(text)
    hits = [capability for needle, capability in _CAPABILITY_HINTS.items() if needle in normalized]
    return _dedupe(hits + list(behavioral_requirements or []))


def _extract_responsibilities(source: JobProfileInput) -> list[str]:
    if source.responsibilities:
        return _split_text(source.responsibilities)[:6]
    chunks = _split_text(source.description) or _split_text(source.requirements) or _split_text(source.experience_context)
    if not chunks:
        return [source.title] if source.title else []
    return chunks[:6]


def _main_mission(source: JobProfileInput) -> str:
    for candidate in (
        _split_text(source.responsibilities)[:1]
        + _split_text(source.description)[:1]
        + _split_text(source.requirements)[:1]
        + _split_text(source.experience_context)[:1]
    ):
        if candidate:
            return candidate[:240]
    return source.title[:240]


def _compute_completeness(source: JobProfileInput) -> float:
    score = 0.0
    if source.title:
        score += 0.10
    if source.description:
        score += 0.25
    if source.requirements:
        score += 0.15
    if source.seniority_level:
        score += 0.10
    if source.minimum_years_experience is not None:
        score += 0.05
    if source.minimum_education_level:
        score += 0.05
    if source.job_area:
        score += 0.05
    if source.responsibilities:
        score += 0.10
    if source.experience_context:
        score += 0.05
    if source.behavioral_requirements:
        score += 0.05
    if source.linked_skills:
        score += min(0.25, 0.08 * len(source.linked_skills))
    return round(min(0.95, score), 2)


def _confidence_from_completeness(completeness: float) -> str:
    if completeness >= 0.75:
        return "high"
    if completeness >= 0.45:
        return "medium"
    return "low"


def _infer_job_area(source: JobProfileInput) -> str:
    explicit = _normalize_explicit_job_area(source.job_area)
    if explicit:
        return explicit

    skill_text = " ".join(skill.name for skill in source.linked_skills)
    category_text = " ".join(filter(None, (skill.category or "" for skill in source.linked_skills)))
    text = normalize_skill_text(
        " ".join(
            filter(
                None,
                [
                    source.title,
                    source.description,
                    source.requirements or "",
                    source.experience_context or "",
                    source.responsibilities or "",
                    " ".join(source.behavioral_requirements),
                    skill_text,
                    category_text,
                ],
            )
        )
    )
    for area in ("data", "administrative", "accounting", "financial", "commercial", "operational", "leadership", "technology"):
        if any(_contains_keyword(text, keyword) for keyword in _AREA_KEYWORDS[area]):
            return area
    return "other"


def _normalize_explicit_job_area(value: str | None) -> str | None:
    normalized = normalize_skill_text(value or "")
    return _EXPLICIT_AREA_MAP.get(normalized)


def _should_be_required_tool(skill: StructuredJobSkill) -> bool:
    category = normalize_skill_text(skill.category or "")
    name = normalize_skill_text(skill.name)
    return any(marker in category for marker in ("tech", "tool", "sistema", "backend", "frontend", "data", "erp")) or any(
        marker in name for marker in ("sql", "python", "excel", "power bi", "react", "fastapi", "protheus", "postgres", "mysql")
    )


def _job_requirement_from_skill(skill: StructuredJobSkill) -> JobRequirement:
    return JobRequirement(
        name=skill.name,
        description=_skill_description(skill),
        is_mandatory=skill.is_mandatory,
        importance_weight=_mandatory_weight(skill) if skill.is_mandatory else _optional_weight(skill),
        evidence_examples=_dedupe([skill.name, *(skill.aliases or [])][:3]),
    )


def _skill_description(skill: StructuredJobSkill) -> str:
    parts = [f"Requisito estruturado vinculado manualmente: {skill.name}"]
    if skill.minimum_level:
        parts.append(f"nível mínimo {skill.minimum_level}")
    if skill.minimum_years is not None:
        parts.append(f"{skill.minimum_years:g}+ anos")
    return "; ".join(parts)


def _mandatory_weight(skill: StructuredJobSkill) -> float:
    return _clamp(max(1.2, float(skill.weight or 1.0)), 1.0, 2.0)


def _optional_weight(skill: StructuredJobSkill) -> float:
    return _clamp(min(float(skill.weight or 0.7), 1.0), 0.3, 1.0)


def _requirement_index(requirements: list[JobRequirement]) -> dict[str, int]:
    index: dict[str, int] = {}
    for idx, requirement in enumerate(requirements):
        index[_skill_key(requirement.name)] = idx
    return index


def _find_requirement_match(index: dict[str, int], skill_keys: set[str]) -> int | None:
    for key in skill_keys:
        if key in index:
            return index[key]
    return None


def _skill_keys_for_matching(skill: StructuredJobSkill) -> set[str]:
    values = {skill.name, skill.normalized_name, *(skill.aliases or [])}
    return {key for value in values if (key := _skill_key(value))}


def _skill_key(value: str | None) -> str:
    if not value:
        return ""
    return normalize_skill_text(value)


def _normalize_target_level(value: str | None) -> str:
    normalized = normalize_skill_text(value or "")
    mapping = {
        "intern": "intern",
        "estagio": "intern",
        "junior": "junior",
        "jr": "junior",
        "mid": "mid",
        "pleno": "mid",
        "senior": "senior",
        "sr": "senior",
        "lead": "lead",
        "principal": "lead",
        "director": "lead",
        "diretor": "lead",
    }
    return mapping.get(normalized, "undefined")


def _contains_keyword(text: str, keyword: str) -> bool:
    normalized_text = normalize_skill_text(text)
    normalized_keyword = normalize_skill_text(keyword)
    if not normalized_keyword:
        return False
    if normalized_text == normalized_keyword:
        return True
    return contains_whole_phrase(normalized_keyword, normalized_text)


def _split_text(text: str | None) -> list[str]:
    raw = _clean_text(text)
    if not raw:
        return []
    normalized = raw.replace("\r", "\n")
    for separator in ("•", "- ", ";"):
        normalized = normalized.replace(separator, "\n")
    parts: list[str] = []
    for chunk in normalized.split("\n"):
        pieces = [piece.strip() for piece in chunk.split(".")]
        parts.extend(piece for piece in pieces if piece.strip())
    return _dedupe(parts)


def _dedupe(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _clean_text(value)
        key = normalize_skill_text(text)
        if not text or key in seen:
            continue
        seen.add(key)
        deduped.append(text)
    return deduped


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_str(value: Any, default: str) -> str:
    text = _clean_text(value)
    return text if text else default


def _safe_list(value: Any) -> list[str]:
    if not value or not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _safe_float(value: Any, default: float | None = 0.0) -> float | None:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default
