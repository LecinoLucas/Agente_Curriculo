"""
ScoringComparisonAdminService.

Serviço interno de validação que compara o score legado com o score adaptativo
para um par vaga/candidato já persistido no sistema.

A implementação prioriza dados estruturados já salvos em banco e só usa
fallbacks determinísticos quando o perfil ainda não foi materializado.
Nenhuma decisão de ranking é alterada aqui.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.adaptive_scorer_service import AdaptiveScorerService
from src.application.services.adaptive_scoring_comparison_service import (
    AdaptiveScoringComparisonService,
)
from src.application.services.candidate_evaluation_insight_service import (
    CandidateEvaluationInsightService,
)
from src.application.services.job_profiler_service import (
    JobProfileInput,
    build_deterministic_job_profile,
    job_skill_from_row,
)
from src.domain.entities.analysis import SeniorityLevel
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_evaluation_insight import CandidateEvaluationInsight
from src.domain.value_objects.adaptive_scoring_comparison import AdaptiveScoringComparisonResult
from src.domain.value_objects.candidate_profile import (
    CandidateCapability,
    CandidateProfile,
    CertificationEntry,
    EducationEntry,
    EvidencedSkill,
    Experience,
)
from src.domain.value_objects.evidence_mapping import EvidenceMapping, RequirementMatch
from src.domain.value_objects.job_profile import (
    AREA_WEIGHTS,
    DEFAULT_WEIGHTS,
    JobProfile,
    JobRequirement,
)
from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import SQLAlchemyAnalysisRepository
from src.infrastructure.repositories.sqlalchemy_candidate_repository import SQLAlchemyCandidateRepository
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository

logger = structlog.get_logger(__name__)

_SENIORITY_ORDER = {
    "intern": 0,
    "junior": 1,
    "mid": 2,
    "senior": 3,
    "lead": 4,
    "principal": 5,
    "director": 6,
    "undefined": 2,
}

_AREA_KEYWORDS: dict[str, set[str]] = {
    "technology": {"python", "backend", "frontend", "api", "llm", "rag", "machine learning", "ml"},
    "data": {"sql", "sql server", "power bi", "bi", "dashboard", "dashboards", "etl", "elt", "pipeline", "pipelines", "ssis"},
    "administrative": {"administrativo", "rotinas administrativas", "excel", "erp", "atendimento", "suporte"},
    "accounting": {"contábil", "contabil", "fiscal", "tribut", "sped", "ecd", "ecf", "dre"},
    "financial": {"financeiro", "financeira", "budget", "budgeting", "forecast"},
    "commercial": {"vendas", "cliente", "relacionamento", "negociação", "negociacao"},
    "operational": {"operação", "operacional", "processos", "rotina"},
    "leadership": {"liderança", "lideranca", "gestão", "gestao", "coordenação", "coordenacao"},
}

_SIGNAL_EQUIVALENCES: dict[str, set[str]] = {
    "sql": {"sql server", "sqlserver", "sql"},
    "bi": {"power bi", "bi", "dashboard", "dashboards"},
    "pipelines": {"etl", "elt", "pipeline", "pipelines", "ssis"},
    "erp": {"erp", "sap", "totvs", "protheus"},
    "customer_relations": {"atendimento", "suporte", "customer service", "relacionamento com cliente"},
    "mentoring": {"treinamento", "mentoria", "mentor", "mentoring"},
    "leadership": {"liderança", "lideranca", "lead", "manager", "management", "gestão", "gestao", "coordenação", "coordenacao"},
}

_CRITICAL_RECOMMENDATIONS = {"reject", "not_recommended", "not_match"}


class ScoringComparisonJobNotFoundError(Exception):
    pass


class ScoringComparisonCandidateNotFoundError(Exception):
    pass


class ScoringComparisonAnalysisNotFoundError(Exception):
    pass


@dataclass(slots=True)
class ScoringComparisonPayload:
    job_id: UUID
    candidate_id: UUID
    analysis_id: UUID
    job_profile_hash: str
    candidate_profile_hash: str
    legacy_match_score: float
    adaptive_match_score: float
    delta: float
    legacy_recommendation: str
    adaptive_recommendation: str
    confidence_score: float
    should_review_manually: bool
    major_differences: list[str]
    strengths: list[str]
    gaps: list[str]
    risk_points: list[str]
    explanation: str
    evaluation_insight: CandidateEvaluationInsight

    def to_dict(self) -> dict[str, object]:
        return {
            "job_id": self.job_id,
            "candidate_id": self.candidate_id,
            "analysis_id": self.analysis_id,
            "job_profile_hash": self.job_profile_hash,
            "candidate_profile_hash": self.candidate_profile_hash,
            "legacy_match_score": self.legacy_match_score,
            "adaptive_match_score": self.adaptive_match_score,
            "delta": self.delta,
            "legacy_recommendation": self.legacy_recommendation,
            "adaptive_recommendation": self.adaptive_recommendation,
            "confidence_score": self.confidence_score,
            "should_review_manually": self.should_review_manually,
            "major_differences": list(self.major_differences),
            "strengths": list(self.strengths),
            "gaps": list(self.gaps),
            "risk_points": list(self.risk_points),
            "explanation": self.explanation,
            "evaluation_insight": self.evaluation_insight.to_dict(),
        }


class ScoringComparisonAdminService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._job_repo = SQLAlchemyJobRepository(session)
        self._candidate_repo = SQLAlchemyCandidateRepository(session)
        self._analysis_repo = SQLAlchemyAnalysisRepository(session)
        self._adaptive_scorer = AdaptiveScorerService()
        self._comparison_service = AdaptiveScoringComparisonService(adaptive_scorer=self._adaptive_scorer)
        self._insight_service = CandidateEvaluationInsightService()

    async def compare(self, job_id: UUID, candidate_id: UUID) -> ScoringComparisonPayload:
        job = await self._job_repo.find_active_by_id(job_id)
        if job is None:
            raise ScoringComparisonJobNotFoundError

        candidate = await self._candidate_repo.find_active_by_id(candidate_id)
        if candidate is None:
            raise ScoringComparisonCandidateNotFoundError

        latest_summary = await self._candidate_repo.find_latest_analysis_summary_for_job(candidate_id, job_id)
        if latest_summary is None or latest_summary.get("status") != "completed":
            raise ScoringComparisonAnalysisNotFoundError

        analysis_id = latest_summary["analysis_id"]
        analysis = await self._analysis_repo.find_completed(analysis_id)
        if analysis is None:
            raise ScoringComparisonAnalysisNotFoundError

        analysis_result = await self._analysis_repo.find_result(analysis_id)
        if analysis_result is None:
            raise ScoringComparisonAnalysisNotFoundError

        resume_version = await self._session.scalar(
            sa.select(ResumeVersionModel).where(ResumeVersionModel.id == analysis.resume_version_id)
        )
        if resume_version is None:
            raise ScoringComparisonAnalysisNotFoundError

        job_profile = await self._build_job_profile(job)
        candidate_profile = self._build_candidate_profile(
            candidate=candidate,
            latest_summary=latest_summary,
            analysis_result=analysis_result,
            resume_version=resume_version,
        )
        evidence_mapping = self._build_evidence_mapping(job_profile, candidate_profile)

        adaptive_result = self._safe_adaptive_score(job_profile, candidate_profile, evidence_mapping)
        comparison = self._comparison_service.compare(job_profile, candidate_profile, evidence_mapping)
        adaptive_result_with_context = self._insight_service.attach_comparison_context(
            adaptive_result,
            legacy_match_score=comparison.legacy_match_score,
            adaptive_match_score=comparison.adaptive_match_score,
            delta=comparison.delta,
        )
        evaluation_insight = self._insight_service.build(
            job_profile=job_profile,
            candidate_profile=candidate_profile,
            evidence_mapping=evidence_mapping,
            adaptive_result=adaptive_result_with_context,
        )

        payload = ScoringComparisonPayload(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=analysis_id,
            job_profile_hash=job_profile.description_hash,
            candidate_profile_hash=candidate_profile.resume_hash,
            legacy_match_score=comparison.legacy_match_score,
            adaptive_match_score=comparison.adaptive_match_score,
            delta=comparison.delta,
            legacy_recommendation=comparison.legacy_recommendation,
            adaptive_recommendation=comparison.adaptive_recommendation,
            confidence_score=comparison.confidence_score,
            should_review_manually=comparison.should_review_manually,
            major_differences=list(comparison.major_differences),
            strengths=list(adaptive_result_with_context.strengths),
            gaps=list(adaptive_result_with_context.gaps),
            risk_points=list(adaptive_result_with_context.risk_points),
            explanation=comparison.explanation,
            evaluation_insight=evaluation_insight,
        )

        logger.info(
            "scoring_comparison_completed",
            job_id=str(job_id),
            candidate_id=str(candidate_id),
            analysis_id=str(analysis_id),
            legacy_match_score=payload.legacy_match_score,
            adaptive_match_score=payload.adaptive_match_score,
            delta=payload.delta,
            confidence_score=payload.confidence_score,
            should_review_manually=payload.should_review_manually,
        )
        return payload

    async def _build_job_profile(self, job: JobModel) -> JobProfile:
        if isinstance(job.job_profile_json, dict) and job.job_profile_json:
            return JobProfile.from_dict(job.job_profile_json)

        skill_rows = await self._job_repo.list_required_skill_rows(job.id)
        return build_deterministic_job_profile(
            JobProfileInput(
                title=job.title,
                description=job.description,
                requirements=job.requirements,
                seniority_level=job.seniority_level,
                minimum_years_experience=float(job.minimum_years_experience) if job.minimum_years_experience is not None else None,
                minimum_education_level=job.minimum_education_level,
                job_area=job.job_area,
                responsibilities=job.responsibilities,
                experience_context=job.experience_context,
                behavioral_requirements=tuple(job.behavioral_requirements or []),
                priority=job.priority,
                linked_skills=tuple(job_skill_from_row(row) for row in skill_rows),
            )
        )

    def _build_candidate_profile(
        self,
        *,
        candidate: CandidateModel,
        latest_summary: dict[str, object],
        analysis_result: AnalysisResultModel,
        resume_version: ResumeVersionModel,
    ) -> CandidateProfile:
        extracted = dict(analysis_result.extracted_data or {})
        skills_data = self._as_list(extracted.get("skills"))
        experiences_data = self._as_list(extracted.get("experiences"))
        education_data = self._as_list(extracted.get("education"))
        certs_data = self._as_list(extracted.get("certifications"))
        leadership_data = extracted.get("leadership_indicators") or {}
        strengths = [str(item).strip() for item in (analysis_result.strengths or []) if str(item).strip()]
        keywords = [str(item).strip() for item in (extracted.get("keywords") or []) if str(item).strip()]

        detected_level = _clean_str(
            latest_summary.get("seniority_level") or analysis_result.seniority_level,
            "undefined",
        )
        experience_years = _safe_float(
            latest_summary.get("total_experience_years") or analysis_result.total_experience_years,
            default=0.0,
        )
        professional_area = _infer_candidate_area(
            skills_data=skills_data,
            experiences_data=experiences_data,
            education_data=education_data,
            keywords=keywords,
            strengths=strengths,
        )

        evidenced_skills: list[EvidencedSkill] = []
        tools_and_systems: list[str] = []
        for item in skills_data:
            name = _clean_str(item.get("name"))
            if not name:
                continue
            proficiency = _normalize_skill_proficiency(item.get("proficiency_level") or item.get("proficiency"))
            years_evidenced = item.get("years_evidenced")
            evidenced_skills.append(
                EvidencedSkill(
                    name=name,
                    evidence_text=_clean_str(item.get("evidence_text"), name),
                    confidence=_map_confidence(proficiency),
                    years_evidenced=_safe_float(years_evidenced, default=None),
                    source="experience",
                )
            )
            tools_and_systems.append(name)

        experiences: list[Experience] = []
        for item in experiences_data:
            company = _clean_str(item.get("company"))
            role = _clean_str(item.get("role") or item.get("role_title"))
            if not company and not role:
                continue
            technologies = item.get("technologies_used") or item.get("technologies") or []
            experiences.append(
                Experience(
                    company=company or "N/D",
                    role=role or "N/D",
                    duration_months=_safe_int(item.get("duration_months")),
                    is_current=bool(item.get("is_current")),
                    is_leadership=bool(item.get("is_leadership")),
                    key_activities=_string_list(item.get("key_activities") or [item.get("description")]),
                    technologies_used=_string_list(technologies),
                )
            )
            tools_and_systems.extend(_string_list(technologies))

        education: list[EducationEntry] = []
        for item in education_data:
            level = _normalize_education_level(item.get("level") or item.get("degree"))
            if not level:
                continue
            education.append(
                EducationEntry(
                    level=level,
                    field=_clean_str(item.get("field"), None),
                    institution=_clean_str(item.get("institution"), None),
                    graduation_year=_safe_int(item.get("graduation_year")),
                    is_completed=bool(item.get("is_completed")),
                )
            )

        if not education and analysis_result.highest_education_level:
            education.append(
                EducationEntry(
                    level=_normalize_education_level(analysis_result.highest_education_level),
                    field=_clean_str(analysis_result.highest_education_field, None),
                    institution=None,
                    graduation_year=None,
                    is_completed=True,
                )
            )

        certifications = [
            CertificationEntry(
                name=_clean_str(item.get("name")),
                issuer=_clean_str(item.get("issuer"), None),
                obtained_date=_clean_str(item.get("obtained_date"), None),
                is_active=bool(item.get("is_active", True)),
            )
            for item in certs_data
            if _clean_str(item.get("name"))
        ]

        capabilities: list[CandidateCapability] = []
        if bool(leadership_data.get("has_management")) or bool(leadership_data.get("has_project_lead")):
            capabilities.append(
                CandidateCapability(
                    name="liderança",
                    evidence_text="Indicadores de liderança identificados na análise.",
                    strength="high",
                    source="summary",
                    confidence="high",
                )
            )
        if analysis_result.communication_score is not None and float(analysis_result.communication_score) >= 70:
            capabilities.append(
                CandidateCapability(
                    name="comunicação",
                    evidence_text="Indicadores de comunicação identificados na análise.",
                    strength="medium",
                    source="summary",
                    confidence="medium",
                )
            )
        if any("organiza" in _normalize_text(str(item)) for item in strengths):
            capabilities.append(
                CandidateCapability(
                    name="organização",
                    evidence_text="Indicadores de organização encontrados nos pontos fortes.",
                    strength="medium",
                    source="summary",
                    confidence="medium",
                )
            )

        leadership_evidence = _string_list(
            [
                "liderança" if bool(leadership_data.get("has_management")) else "",
                "liderança de projeto" if bool(leadership_data.get("has_project_lead")) else "",
                "mentoria" if bool(leadership_data.get("has_mentoring")) else "",
                "trabalho cross-team" if bool(leadership_data.get("has_cross_team")) else "",
            ]
        )
        if not leadership_evidence and analysis_result.leadership_score is not None and float(analysis_result.leadership_score) >= 50:
            leadership_evidence.append("Liderança evidenciada na análise.")

        business_impact_evidence = _string_list(strengths)
        if not business_impact_evidence and analysis_result.candidate_summary:
            business_impact_evidence.append(str(analysis_result.candidate_summary))

        profile_completeness = _candidate_profile_completeness(
            skills=skills_data,
            experiences=experiences_data,
            education=education,
            capabilities=capabilities,
            leadership_evidence=leadership_evidence,
            business_impact_evidence=business_impact_evidence,
            summary_text=analysis_result.candidate_summary,
        )

        confidence = "high" if profile_completeness >= 0.70 else "medium" if profile_completeness >= 0.40 else "low"

        return CandidateProfile(
            detected_level=detected_level,
            estimated_experience_years=experience_years,
            current_role=_clean_str(candidate.full_name, None),
            professional_area=professional_area,
            experiences=experiences,
            evidenced_skills=evidenced_skills,
            tools_and_systems=_dedupe(tools_and_systems),
            capabilities=capabilities,
            education=education,
            certifications=certifications,
            leadership_evidence=leadership_evidence,
            business_impact_evidence=business_impact_evidence,
            profile_completeness=profile_completeness,
            confidence=confidence,
            resume_hash=(resume_version.file_hash_sha256 or _hash16(resume_version.original_file_name or candidate.full_name)),
        )

    @staticmethod
    def _as_list(value: object) -> list[dict[str, object]]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, dict)]

    def _build_evidence_mapping(self, job_profile: JobProfile, candidate_profile: CandidateProfile) -> EvidenceMapping:
        candidate_signals = self._candidate_signal_index(candidate_profile)
        requirement_matches: list[RequirementMatch] = []
        matched_signals: set[str] = set()
        critical_unmapped: list[str] = []

        job_requirements = self._job_requirement_specs(job_profile)
        for requirement_name, requirement_type, is_mandatory in job_requirements:
            match = self._match_requirement(requirement_name, requirement_type, candidate_signals)
            requirement_matches.append(match)
            if match.match_type != "absent":
                matched_signals.update(_normalize_text(quote) for quote in match.evidence_quotes if _normalize_text(quote))
            if is_mandatory and match.match_status in {"not_evidenced", "unclear"}:
                critical_unmapped.append(requirement_name)

        candidate_extra_strengths = self._candidate_extra_strengths(candidate_profile, matched_signals)
        risk_points = self._build_risk_points(job_profile, candidate_profile, critical_unmapped)
        overall_strength = self._overall_strength(requirement_matches)
        confidence = self._mapping_confidence(job_profile, candidate_profile, requirement_matches)

        return EvidenceMapping(
            job_profile_hash=job_profile.description_hash,
            candidate_profile_hash=candidate_profile.resume_hash,
            requirement_matches=requirement_matches,
            overall_evidence_strength=overall_strength,
            confidence=confidence,
            unmapped_critical_requirements=_dedupe(critical_unmapped),
            candidate_extra_strengths=candidate_extra_strengths,
            risk_points=risk_points,
        )

    def _safe_adaptive_score(
        self,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
        evidence_mapping: EvidenceMapping,
    ) -> AdaptiveScoreResult:
        try:
            return self._adaptive_scorer.score(job_profile, candidate_profile, evidence_mapping)
        except Exception as exc:
            logger.warning(
                "scoring_comparison_adaptive_failed",
                job_profile_hash=job_profile.description_hash,
                candidate_profile_hash=candidate_profile.resume_hash,
                error=str(exc),
            )
            return AdaptiveScoreResult(
                match_score=0.0,
                confidence_score=0.0,
                recommendation="reject",
                score_breakdown={},
                strengths=[],
                gaps=[],
                risk_points=["adaptive_scoring_fallback"],
                critical_coverage=0.0,
                desirable_coverage=0.0,
                area=job_profile.area,
                target_level=job_profile.target_level,
                detected_level=candidate_profile.detected_level,
            )

    def _job_requirement_specs(self, job_profile: JobProfile) -> list[tuple[str, str, bool]]:
        specs: list[tuple[str, str, bool]] = []
        for requirement in job_profile.critical_requirements:
            specs.append((requirement.name, "critical", True))
        for requirement in job_profile.desirable_requirements:
            specs.append((requirement.name, "desirable", False))
        for tool in job_profile.required_tools:
            specs.append((tool, "tool", True))
        for capability in job_profile.required_capabilities:
            specs.append((capability, "capability", True))
        for responsibility in job_profile.responsibilities:
            specs.append((responsibility, "responsibility", False))
        return specs

    def _candidate_signal_index(self, candidate_profile: CandidateProfile) -> dict[str, str]:
        signals: dict[str, str] = {}

        def _add(name: str, evidence: str) -> None:
            normalized = _normalize_text(name)
            if normalized and normalized not in signals:
                signals[normalized] = _clean_str(evidence, name)

        for skill in candidate_profile.evidenced_skills:
            _add(skill.name, skill.evidence_text)
        for tool in candidate_profile.tools_and_systems:
            _add(tool, tool)
        for capability in candidate_profile.capabilities:
            _add(capability.name, capability.evidence_text)
        for experience in candidate_profile.experiences:
            summary = f"{experience.role} at {experience.company}"
            _add(summary, summary)
            for tech in experience.technologies_used:
                _add(tech, f"{experience.role} at {experience.company}")
        for evidence in candidate_profile.leadership_evidence:
            _add(evidence, evidence)
        for evidence in candidate_profile.business_impact_evidence:
            _add(evidence, evidence)
        for education in candidate_profile.education:
            if education.field:
                _add(education.field, education.field)
            _add(education.level, education.level)
        return signals

    def _match_requirement(
        self,
        requirement_name: str,
        requirement_type: str,
        candidate_signals: dict[str, str],
    ) -> RequirementMatch:
        normalized = _normalize_text(requirement_name)
        if not normalized:
            return RequirementMatch(
                requirement=requirement_name,
                requirement_type=requirement_type,
                match_status="unclear",
                match_type="absent",
                evidence_quotes=[],
                evidence_strength="none",
                confidence="low",
                score_hint=0.0,
                explanation="Requisito vazio ou não interpretável.",
            )

        direct_quote = candidate_signals.get(normalized)
        if direct_quote:
            return RequirementMatch(
                requirement=requirement_name,
                requirement_type=requirement_type,
                match_status="meets",
                match_type="direct",
                evidence_quotes=[direct_quote],
                evidence_strength="high",
                confidence="high",
                score_hint=95.0,
                explanation=f"Evidencia direta para {requirement_name}.",
            )

        equivalent_key, equivalent_quote = self._equivalent_match(normalized, candidate_signals)
        if equivalent_quote is not None:
            return RequirementMatch(
                requirement=requirement_name,
                requirement_type=requirement_type,
                match_status="meets",
                match_type="equivalent",
                evidence_quotes=[equivalent_quote],
                evidence_strength="high",
                confidence="high",
                score_hint=90.0,
                explanation=f"Equivalencia profissional identificada para {requirement_name}.",
            )

        inferred_quote = self._inferred_match(normalized, candidate_signals)
        if inferred_quote is not None:
            return RequirementMatch(
                requirement=requirement_name,
                requirement_type=requirement_type,
                match_status="partially_meets",
                match_type="inferred",
                evidence_quotes=[inferred_quote],
                evidence_strength="medium",
                confidence="medium",
                score_hint=65.0,
                explanation=f"Correspondencia inferida para {requirement_name}.",
            )

        return RequirementMatch(
            requirement=requirement_name,
            requirement_type=requirement_type,
            match_status="not_evidenced",
            match_type="absent",
            evidence_quotes=[],
            evidence_strength="none",
            confidence="low",
            score_hint=0.0,
            explanation=f"Nenhuma evidencia encontrada para {requirement_name}.",
        )

    def _equivalent_match(self, normalized: str, candidate_signals: dict[str, str]) -> tuple[str | None, str | None]:
        aliases = _SIGNAL_EQUIVALENCES.get(normalized)
        if aliases is None:
            for key, values in _SIGNAL_EQUIVALENCES.items():
                if normalized == key or normalized in values:
                    aliases = values | {key}
                    break
        if aliases is None:
            return None, None

        for alias in aliases:
            quote = candidate_signals.get(_normalize_text(alias))
            if quote is not None:
                return alias, quote

        for signal_name, quote in candidate_signals.items():
            if any(alias in signal_name or signal_name in alias for alias in aliases):
                return signal_name, quote
        return None, None

    def _inferred_match(self, normalized: str, candidate_signals: dict[str, str]) -> str | None:
        if any(token in normalized for token in ("liderança", "lideranca", "lead")):
            for key in ("liderança", "lideranca", "mentoring", "management"):
                quote = candidate_signals.get(_normalize_text(key))
                if quote is not None:
                    return quote
        if any(token in normalized for token in ("comunica", "cliente", "relacionamento")):
            for key in ("comunicação", "atendimento", "suporte", "relacionamento com cliente"):
                quote = candidate_signals.get(_normalize_text(key))
                if quote is not None:
                    return quote
        if any(token in normalized for token in ("trein", "mentor")):
            for key in ("mentoria", "treinamento"):
                quote = candidate_signals.get(_normalize_text(key))
                if quote is not None:
                    return quote
        return None

    def _candidate_extra_strengths(self, candidate_profile: CandidateProfile, matched_signals: set[str]) -> list[str]:
        extras: list[str] = []
        for skill in candidate_profile.evidenced_skills:
            if _normalize_text(skill.name) not in matched_signals:
                extras.append(skill.name)
        for tool in candidate_profile.tools_and_systems:
            if _normalize_text(tool) not in matched_signals:
                extras.append(tool)
        for capability in candidate_profile.capabilities:
            if _normalize_text(capability.name) not in matched_signals:
                extras.append(capability.name)
        for evidence in candidate_profile.business_impact_evidence[:2]:
            if _normalize_text(evidence) not in matched_signals:
                extras.append(evidence)
        return _dedupe(extras)

    def _build_risk_points(
        self,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
        critical_unmapped: list[str],
    ) -> list[str]:
        risks: list[str] = []
        if candidate_profile.profile_completeness < 0.30:
            risks.append("candidate_profile_incomplete")
        if job_profile.job_completeness_score < 0.50:
            risks.append("job_profile_incomplete")
        if critical_unmapped:
            risks.append(f"critical_requirements_uncovered:{', '.join(_dedupe(critical_unmapped)[:3])}")
        if _job_requires_leadership(job_profile) and not candidate_profile.leadership_evidence:
            risks.append("leadership_gap")
        if _seniority_rank(candidate_profile.detected_level) - _seniority_rank(job_profile.target_level) >= 2:
            risks.append("overqualification")
        return _dedupe(risks)

    def _overall_strength(self, requirement_matches: list[RequirementMatch]) -> str:
        if not requirement_matches:
            return "none"
        avg = sum(match.score_hint for match in requirement_matches) / len(requirement_matches)
        if avg >= 80:
            return "high"
        if avg >= 60:
            return "medium"
        if avg > 0:
            return "low"
        return "none"

    def _mapping_confidence(self, job_profile: JobProfile, candidate_profile: CandidateProfile, requirement_matches: list[RequirementMatch]) -> str:
        if not requirement_matches:
            return "low"
        direct = sum(1 for match in requirement_matches if match.match_type == "direct")
        equivalent = sum(1 for match in requirement_matches if match.match_type == "equivalent")
        inferred = sum(1 for match in requirement_matches if match.match_type == "inferred")
        total = len(requirement_matches)
        score = (
            (direct / total) * 0.45
            + (equivalent / total) * 0.25
            + (inferred / total) * 0.10
            + candidate_profile.profile_completeness * 0.10
            + job_profile.job_completeness_score * 0.10
        )
        if score >= 0.70:
            return "high"
        if score >= 0.45:
            return "medium"
        return "low"

    async def _load_job_profile(self, job: JobModel) -> JobProfile:
        return await self._build_job_profile(job)


def _infer_job_area(job: JobModel) -> str:
    text = _normalize_text(" ".join(filter(None, [job.title, job.description, job.requirements])))
    if any(keyword in text for keyword in _AREA_KEYWORDS["data"]):
        return "data"
    if any(keyword in text for keyword in _AREA_KEYWORDS["administrative"]):
        return "administrative"
    if any(keyword in text for keyword in _AREA_KEYWORDS["accounting"]):
        return "accounting"
    if any(keyword in text for keyword in _AREA_KEYWORDS["financial"]):
        return "financial"
    if any(keyword in text for keyword in _AREA_KEYWORDS["commercial"]):
        return "commercial"
    if any(keyword in text for keyword in _AREA_KEYWORDS["operational"]):
        return "operational"
    if any(keyword in text for keyword in _AREA_KEYWORDS["leadership"]):
        return "leadership"
    if any(keyword in text for keyword in _AREA_KEYWORDS["technology"]):
        return "technology"
    return "other"


def _infer_candidate_area(
    *,
    skills_data: list[dict[str, object]],
    experiences_data: list[dict[str, object]],
    education_data: list[dict[str, object]],
    keywords: list[str],
    strengths: list[str],
) -> str:
    text_bits: list[str] = []
    for item in skills_data:
        text_bits.append(_clean_str(item.get("name")))
    for item in experiences_data:
        text_bits.append(_clean_str(item.get("role") or item.get("role_title")))
        text_bits.extend(_string_list(item.get("technologies_used") or item.get("technologies")))
    for item in education_data:
        text_bits.append(_clean_str(item.get("field")))
        text_bits.append(_clean_str(item.get("degree") or item.get("level")))
    text_bits.extend(keywords)
    text_bits.extend(strengths)
    text = _normalize_text(" ".join(text_bits))

    for area, signals in _AREA_KEYWORDS.items():
        if any(keyword in text for keyword in signals):
            return area
    return "other"


def _candidate_profile_completeness(
    *,
    skills: list[dict[str, object]],
    experiences: list[dict[str, object]],
    education: list[EducationEntry],
    capabilities: list[CandidateCapability],
    leadership_evidence: list[str],
    business_impact_evidence: list[str],
    summary_text: object,
) -> float:
    score = 0.0
    if skills:
        score += 0.25
    if experiences:
        score += 0.25
    if education:
        score += 0.15
    if capabilities:
        score += 0.10
    if leadership_evidence:
        score += 0.10
    if business_impact_evidence:
        score += 0.10
    if _clean_str(summary_text):
        score += 0.05
    return round(min(1.0, score), 2)


def _job_requires_leadership(job_profile: JobProfile) -> bool:
    text = _normalize_text(" ".join([job_profile.main_mission, *job_profile.required_capabilities, *job_profile.seniority_signals]))
    return any(token in text for token in ("liderança", "lideranca", "lead", "gestão", "gestao", "coordenação", "coordenacao"))


def _seniority_rank(level: str | None) -> int:
    return _SENIORITY_ORDER.get(_normalize_text(level), _SENIORITY_ORDER["mid"])


def _normalize_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    return " ".join(text.split())


def _clean_str(value: object, default: str | None = "") -> str:
    if value is None:
        return default or ""
    text = str(value).strip()
    return text if text else (default or "")


def _hash16(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _split_text(text: object) -> list[str]:
    raw = _clean_str(text)
    if not raw:
        return []
    parts = [part.strip() for part in raw.replace("\n", ".").split(".")]
    return [part for part in parts if part]


def _string_list(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    result: list[str] = []
    for value in values:
        text = _clean_str(value)
        if text:
            result.append(text)
    return _dedupe(result)


def _dedupe(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _clean_str(value)
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(text)
    return deduped


def _safe_int(value: object) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: object, default: float | None = 0.0) -> float:
    try:
        if value is None:
            return float(default or 0.0)
        return float(value)
    except (TypeError, ValueError):
        return float(default or 0.0)


def _normalize_skill_proficiency(value: object) -> str:
    level = _clean_str(value, "basic").lower()
    mapping = {
        "expert": "expert",
        "advanced": "advanced",
        "intermediate": "intermediate",
        "basic": "basic",
        "high": "advanced",
        "medium": "intermediate",
        "low": "basic",
    }
    return mapping.get(level, "basic")


def _map_confidence(proficiency: str) -> str:
    mapping = {
        "expert": "very_high",
        "advanced": "high",
        "intermediate": "medium",
        "basic": "low",
    }
    return mapping.get(proficiency, "medium")


def _normalize_education_level(value: object) -> str:
    level = _normalize_text(value)
    mapping = {
        "high school": "high_school",
        "technical": "technical",
        "bachelor": "bachelor",
        "postgraduate": "postgraduate",
        "master": "master",
        "phd": "phd",
        "none": "none",
    }
    return mapping.get(level, level if level in {"none", "technical", "bachelor", "postgraduate", "master", "phd", "high_school"} else "none")


def _is_tool_signal(value: str) -> bool:
    normalized = _normalize_text(value)
    return any(token in normalized for token in ("sql", "power bi", "bi", "dashboard", "etl", "pipeline", "erp", "excel", "python", "llm", "rag", "ssis"))


def _is_capability_signal(value: str) -> bool:
    normalized = _normalize_text(value)
    return any(token in normalized for token in ("lider", "comun", "org", "cliente", "atend", "suporte", "ment", "trein"))
