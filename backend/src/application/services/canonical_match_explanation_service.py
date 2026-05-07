from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from src.application.services.analysis_service import (
    _CANONICAL_AI_WEIGHT,
    _MANDATORY_THRESHOLD,
    _NO_REQUIREMENTS_SCORE_CAP,
    _calculate_seniority_score,
    _canonical_component_weights,
    _calculate_experience_score,
    _evaluate_deal_breaker,
    _job_has_structured_requirements,
    _validate_education,
    _validate_experience,
)


def _to_decimal(value: Decimal | float | int | None, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except Exception:
        return default


def _to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value.quantize(Decimal("0.01")))


def _clean_list(values: list[str] | None) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values or []:
        text = str(value).strip()
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    return cleaned


@dataclass(frozen=True, slots=True)
class MatchExplanationComponent:
    score: Decimal
    weight: Decimal
    contribution: Decimal

    def to_dict(self) -> dict[str, float]:
        return {
            "score": float(self.score.quantize(Decimal("0.01"))),
            "weight": float(self.weight.quantize(Decimal("0.01"))),
            "contribution": float(self.contribution.quantize(Decimal("0.01"))),
        }


@dataclass(frozen=True, slots=True)
class MatchExplanationResult:
    final_score: Decimal
    recommendation: str
    explanation: str
    breakdown: dict[str, MatchExplanationComponent | None]
    highlights: list[str]
    risks: list[str]
    matched_skills: list[str]
    missing_skills: list[str]
    validation_status: str
    partial_matches: list[dict[str, Any]] = None  # type: ignore

    def __post_init__(self):
        if self.partial_matches is None:
            object.__setattr__(self, "partial_matches", [])

    def to_dict(self) -> dict[str, Any]:
        return {
            "final_score": float(self.final_score.quantize(Decimal("0.01"))),
            "recommendation": self.recommendation,
            "explanation": self.explanation,
            "breakdown": {
                key: value.to_dict() if value is not None else None
                for key, value in self.breakdown.items()
            },
            "highlights": list(self.highlights),
            "risks": list(self.risks),
            "matched_skills": list(self.matched_skills),
            "missing_skills": list(self.missing_skills),
            "validation_status": self.validation_status,
            "partial_matches": list(self.partial_matches) if self.partial_matches else [],
        }


def build_match_explanation(
    *,
    job: object,
    analysis_result: object,
    job_skill_rows: list[object],
    final_score: Decimal | float | int | None,
    recommendation: str | None,
    matched_skills: list[str] | None,
    missing_skills: list[str] | None,
    candidate_skills: list[str] | None = None,
) -> MatchExplanationResult:
    matched_skill_names = _clean_list(matched_skills)
    missing_skill_names = _clean_list(missing_skills)
    matched_lookup = {item.casefold() for item in matched_skill_names}

    mandatory_skills = [row for row in job_skill_rows if row.JobRequiredSkillModel.is_mandatory]
    optional_skills = [row for row in job_skill_rows if not row.JobRequiredSkillModel.is_mandatory]

    mandatory_names = [str(row.skill_name).strip() for row in mandatory_skills if str(row.skill_name).strip()]
    optional_names = [str(row.skill_name).strip() for row in optional_skills if str(row.skill_name).strip()]

    total_mandatory = len(mandatory_names)
    total_optional = len(optional_names)

    # Calculate weighted mandatory score using equivalence service when candidate_skills provided
    partial_matches: list[dict[str, Any]] = []
    if candidate_skills:
        from src.application.services.skill_equivalence_service import SkillEquivalenceService
        equivalence_service = SkillEquivalenceService()
        mandatory_scores: list[Decimal] = []
        all_mandatory_exact = True

        for job_skill_name in mandatory_names:
            if job_skill_name.casefold() in matched_lookup:
                # Exact match already in matched_skills
                mandatory_scores.append(Decimal("1.0"))
            else:
                # Try to find best match in candidate_skills using equivalence service
                best_score = Decimal("0.0")
                best_candidate = None

                for candidate_skill in candidate_skills:
                    evidence = equivalence_service.match_skill(candidate_skill, job_skill_name)
                    if evidence.matched and evidence.score > float(best_score):
                        best_score = Decimal(str(evidence.score))
                        best_candidate = candidate_skill

                mandatory_scores.append(best_score)

                # Track partial matches (0 < score < 1)
                if float(best_score) > 0 and float(best_score) < 1:
                    partial_matches.append(
                        {
                            "required": job_skill_name,
                            "candidate": best_candidate or "",
                            "score": float(best_score),
                            "reason": f'"{best_candidate}" parcialmente atende "{job_skill_name}".',
                            "source": "partial_match",
                        }
                    )

                if float(best_score) < 1:
                    all_mandatory_exact = False

        mandatory_matched = sum(1 for score in mandatory_scores if score >= Decimal("1.0"))
        mandatory_score = (
            sum(mandatory_scores) / Decimal(len(mandatory_scores)) * Decimal("100")
            if mandatory_scores
            else Decimal("0")
        ).quantize(Decimal("0.01"))
    else:
        # Original binary matching (no candidate_skills provided)
        mandatory_matched = sum(1 for name in mandatory_names if name.casefold() in matched_lookup)
        mandatory_score = (
            Decimal(mandatory_matched) / Decimal(total_mandatory) * Decimal("100")
            if total_mandatory > 0
            else Decimal("0")
        ).quantize(Decimal("0.01"))
        all_mandatory_exact = True

    optional_matched = sum(1 for name in optional_names if name.casefold() in matched_lookup)

    optional_score = (
        Decimal(optional_matched) / Decimal(total_optional) * Decimal("100")
        if total_optional > 0
        else Decimal("0")
    ).quantize(Decimal("0.01"))
    mandatory_percentage = (
        Decimal(mandatory_matched) / Decimal(total_mandatory) * Decimal("100")
        if total_mandatory > 0
        else Decimal("100")
    )

    candidate_years = _to_decimal(getattr(analysis_result, "total_experience_years", None), default=None)
    required_years = _to_decimal(getattr(job, "minimum_years_experience", None), default=None)
    experience_score = _calculate_experience_score(candidate_years, required_years).quantize(Decimal("0.01"))

    weights = _canonical_component_weights(
        total_mandatory=total_mandatory,
        total_optional=total_optional,
    )
    w_mand = weights["mandatory"]
    w_opt = weights["optional"]
    w_exp = weights["experience"]
    w_sen = weights["seniority"]
    w_ai = _CANONICAL_AI_WEIGHT

    seniority_score = _calculate_seniority_score(
        getattr(analysis_result, "seniority_level", None),
        getattr(job, "seniority_level", None),
    )
    ai_score = Decimal("0.00")

    breakdown: dict[str, MatchExplanationComponent | None] = {
        "mandatory": MatchExplanationComponent(
            score=mandatory_score,
            weight=w_mand,
            contribution=(mandatory_score * w_mand).quantize(Decimal("0.01")),
        ),
        "optional": MatchExplanationComponent(
            score=optional_score,
            weight=w_opt,
            contribution=(optional_score * w_opt).quantize(Decimal("0.01")),
        ),
        "experience": MatchExplanationComponent(
            score=experience_score,
            weight=w_exp,
            contribution=(experience_score * w_exp).quantize(Decimal("0.01")),
        ),
        "seniority": MatchExplanationComponent(
            score=seniority_score,
            weight=w_sen,
            contribution=(seniority_score * w_sen).quantize(Decimal("0.01")),
        ),
        "ai_adjustment": MatchExplanationComponent(
            score=ai_score,
            weight=w_ai,
            contribution=(ai_score * w_ai).quantize(Decimal("0.01")),
        )
        if w_ai > 0
        else None,
    }

    education_result = _validate_education(
        getattr(analysis_result, "highest_education_level", None),
        getattr(job, "minimum_education_level", None),
    )
    experience_result = _validate_experience(candidate_years, required_years)

    validation_status = "pass"
    validation_reasons: list[str] = []
    missing_evidence: list[str] = []

    if education_result.status == "fail":
        validation_status = "fail"
        if education_result.reason:
            validation_reasons.append(education_result.reason)
    elif education_result.status == "unknown":
        validation_status = "unknown"
        missing_evidence.append("education")
        if education_result.reason:
            validation_reasons.append(education_result.reason)

    if experience_result.status == "fail":
        validation_status = "fail"
        if experience_result.reason:
            validation_reasons.append(experience_result.reason)
    elif experience_result.status == "unknown" and validation_status != "fail":
        validation_status = "unknown"
        missing_evidence.append("experience")
        if experience_result.reason:
            validation_reasons.append(experience_result.reason)

    for deal_breaker in getattr(job, "deal_breakers", None) or []:
        breaker_hit, breaker_reason = _evaluate_deal_breaker(deal_breaker, analysis_result)
        if breaker_hit:
            validation_status = "fail"
            if breaker_reason:
                validation_reasons.append(breaker_reason)

    if validation_status != "fail" and total_mandatory > 0 and mandatory_percentage < _MANDATORY_THRESHOLD:
        validation_status = "fail"
        validation_reasons.append(
            f"Não atende habilidades obrigatórias ({mandatory_matched}/{total_mandatory})"
        )

    highlights: list[str] = []
    risks: list[str] = []

    if mandatory_score >= Decimal("85"):
        highlights.append(
            f"Cobertura alta de skills obrigatórias ({mandatory_matched}/{total_mandatory})."
        )
    if experience_score >= Decimal("80"):
        if required_years is not None:
            highlights.append(
                f"Experiência atende ou supera o mínimo exigido ({candidate_years or Decimal('0'):.1f} vs {required_years:.1f} anos)."
            )
        else:
            highlights.append("Experiência consistente para o contexto da vaga.")
    if seniority_score >= Decimal("80"):
        highlights.append("Senioridade bem alinhada com a vaga.")

    if missing_skill_names:
        risks.append(f"Skills obrigatórias faltantes: {', '.join(missing_skill_names)}.")
    if experience_score < Decimal("60"):
        risks.append("Experiência abaixo do ideal para a vaga.")
    if seniority_score < Decimal("60"):
        risks.append("Senioridade abaixo do ideal para a vaga.")
    if validation_status == "unknown" and missing_evidence:
        risks.append(f"Dados insuficientes para validação objetiva: {', '.join(missing_evidence)}.")

    has_structured_requirements = _job_has_structured_requirements(
        total_skills=total_mandatory + total_optional,
        seniority_level=getattr(job, "seniority_level", None),
        minimum_years_experience=required_years,
        minimum_education_level=getattr(job, "minimum_education_level", None),
        deal_breakers=getattr(job, "deal_breakers", None),
    )

    final_score_decimal = _to_decimal(final_score).quantize(Decimal("0.01"))
    recommendation_value = str(recommendation or "not_recommended")

    explanation_parts: list[str] = [
        f"Score final {final_score_decimal:.2f} com recommendation {recommendation_value}."
    ]
    explanation_parts.append(
        f"Obrigatórias {mandatory_matched}/{total_mandatory} e opcionais {optional_matched}/{total_optional}."
    )

    if not has_structured_requirements and final_score_decimal <= _NO_REQUIREMENTS_SCORE_CAP:
        explanation_parts.append(
            "A vaga não possui requisitos estruturados suficientes; o score foi limitado para evitar falso positivo."
        )

    if recommendation_value == "not_match":
        main_block = validation_reasons[0] if validation_reasons else "Falha crítica nas regras da vaga."
        risks.insert(0, main_block)
        explanation_parts.append(f"Bloqueio principal: {main_block}")
    elif validation_status == "unknown" and validation_reasons:
        explanation_parts.append(f"Revisão manual necessária: {validation_reasons[0]}")
    elif not highlights:
        explanation_parts.append("Sem destaques fortes o suficiente para elevar a recomendação.")

    # Add risk if all mandatory skills are only partial matches
    if candidate_skills and all_mandatory_exact is False and total_mandatory > 0:
        partial_count = sum(1 for score in mandatory_scores if 0 < float(score) < 1)
        if partial_count == total_mandatory:
            risks.append("Nenhuma skill obrigatória atendida com exatidão — avalie cuidadosamente.")

    return MatchExplanationResult(
        final_score=final_score_decimal,
        recommendation=recommendation_value,
        explanation=" ".join(explanation_parts),
        breakdown=breakdown,
        highlights=_clean_list(highlights),
        risks=_clean_list(risks + validation_reasons[1:] if recommendation_value == "not_match" else risks),
        matched_skills=matched_skill_names,
        missing_skills=missing_skill_names,
        validation_status=validation_status,
        partial_matches=partial_matches,
    )
