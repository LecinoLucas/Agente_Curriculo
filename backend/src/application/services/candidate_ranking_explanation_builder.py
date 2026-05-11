from __future__ import annotations

from decimal import Decimal
from typing import Any

import structlog

from src.application.services.analysis_service import _canonical_component_weights
from src.application.services.job_skill_priority_service import (
    is_complementary_skill,
    is_priority_skill,
)
from src.application.services.strict_payload import optional_dict
from src.infrastructure.database.models.job_model import JobModel

logger = structlog.get_logger(__name__)

_SCORE_FACTOR_SUMMARY_LIMIT = 4
_ALLOWED_SCORE_FACTOR_TYPES = {
    "required_skill_match",
    "missing_required_skill",
    "complementary_skill_bonus",
    "adjacent_skill_match",
    "experience_match",
    "insufficient_experience",
    "seniority_match",
    "seniority_gap",
    "education_match",
    "deal_breaker_violation",
    "eligibility_cap",
    "data_confidence_penalty",
}


def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (ValueError, TypeError) as exc:
        logger.warning(
            "ranking.decimal_conversion_failed",
            value=str(value)[:100],
            error=str(exc),
            using_default=str(default),
        )
        return default


def _extract_priority_level(item: Any) -> str | None:
    if hasattr(item, "JobRequiredSkillModel"):
        link = getattr(item, "JobRequiredSkillModel", None)
        return str(getattr(link, "priority_level", "") or "").strip() or None
    if isinstance(item, tuple) and item:
        first = item[0]
        return str(getattr(first, "priority_level", "") or "").strip() or None
    return None


def _extract_skill_name(item: Any) -> str:
    if hasattr(item, "skill_name"):
        return str(getattr(item, "skill_name", "") or "").strip()
    if isinstance(item, tuple) and len(item) > 1:
        return str(item[1] or "").strip()
    return ""


def _is_priority_item(item: Any) -> bool:
    level = _extract_priority_level(item)
    return bool(level) and is_priority_skill(level)


def _is_complementary_item(item: Any) -> bool:
    level = _extract_priority_level(item)
    return bool(level) and is_complementary_skill(level)


class CandidateRankingExplanationBuilder:
    def build_score_factors(
        self,
        *,
        row: dict[str, Any],
        job: JobModel,
        job_skill_rows: list[Any],
        bd: dict[str, Any],
        matched: list[str],
        missing: list[str],
        deal_breaker_violations: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        priority_names = [
            _extract_skill_name(item)
            for item in job_skill_rows
            if _is_priority_item(item) and _extract_skill_name(item)
        ]
        complementary_names = [
            _extract_skill_name(item)
            for item in job_skill_rows
            if _is_complementary_item(item) and _extract_skill_name(item)
        ]
        priority_lookup = {name.casefold(): name for name in priority_names}
        matched_required = [skill for skill in matched if skill.casefold() in priority_lookup]
        missing_required = [skill for skill in missing if skill.casefold() in priority_lookup]

        breakdown = optional_dict(row, "skill_evidence_breakdown")
        partial_matches = breakdown.get("partial_matches", []) or []

        weights = _canonical_component_weights(
            total_priority=len(priority_names),
            total_complementary=len(complementary_names),
        )
        priority_slot_impact = (
            (Decimal("100") * weights["priority"]) / Decimal(str(len(priority_names)))
            if priority_names
            else Decimal("0")
        ).quantize(Decimal("0.01"))

        factors: list[dict[str, Any]] = []
        display_order = 0

        def add_factor(
            *,
            factor_type: str,
            factor_key: str,
            factor_label: str,
            impact_score: Decimal,
            normalized_weight: Decimal,
            direction: str,
            evidence: dict[str, Any] | None = None,
        ) -> None:
            nonlocal display_order
            factors.append({
                "factor_type": factor_type,
                "factor_key": factor_key,
                "factor_label": factor_label,
                "impact_score": float(impact_score.quantize(Decimal("0.01"))),
                "normalized_weight": float(normalized_weight.quantize(Decimal("0.0001"))),
                "direction": direction,
                "evidence_json": evidence or {},
                "display_order": display_order,
            })
            display_order += 1

        if deal_breaker_violations:
            penalty = max(Decimal("0.00"), bd.get("deal_breaker_penalty_score", Decimal("0.00")))
            for violation in deal_breaker_violations:
                add_factor(
                    factor_type="deal_breaker_violation",
                    factor_key=str(violation.get("field") or "deal_breaker"),
                    factor_label=str(violation.get("description") or violation.get("reason") or "Critério eliminatório violado"),
                    impact_score=-penalty if penalty > 0 else Decimal("-100.00"),
                    normalized_weight=Decimal("1.0"),
                    direction="negative",
                    evidence={"violation": dict(violation)},
                )

        if bd.get("cap_applied"):
            before_cap = _to_decimal(bd.get("final_score_before_cap"))
            after_cap = _to_decimal(bd.get("final_score_after_cap"))
            cap_penalty = max(Decimal("0.00"), before_cap - after_cap).quantize(Decimal("0.01"))
            cap_reason = str(bd.get("cap_reason") or "cap")
            factor_label = {
                "explicit_deal_breaker": "Critério eliminatório explícito aplicou cap",
                "minimum_education": "Educação abaixo do mínimo aplicou cap",
                "minimum_experience": "Experiência abaixo do mínimo aplicou cap",
                "minimum_domain_fit": "Aderência mínima ao domínio aplicou cap",
                "missing_critical_mandatory": "Skill essencial crítica ausente aplicou cap",
                "missing_eliminatory_skills": "Critério eliminatório de skill aplicou cap",
            }.get(cap_reason, "Regra de elegibilidade aplicou cap")
            add_factor(
                factor_type="eligibility_cap",
                factor_key=cap_reason,
                factor_label=factor_label,
                impact_score=-cap_penalty if cap_penalty > 0 else Decimal("-1.00"),
                normalized_weight=Decimal("1.0"),
                direction="negative",
                evidence={
                    "cap_reason": cap_reason,
                    "failed_rule": bd.get("failed_rule"),
                    "failed_dimension": bd.get("failed_dimension"),
                    "before_cap": float(before_cap),
                    "after_cap": float(after_cap),
                    "validation_reason": bd.get("validation_reason"),
                },
            )

        for skill in matched_required[:5]:
            add_factor(
                factor_type="required_skill_match",
                factor_key=skill.casefold(),
                factor_label=f"Skill essencial atendida: {skill}",
                impact_score=priority_slot_impact,
                normalized_weight=weights["priority"],
                direction="positive",
                evidence={"matched": True, "required_skill": skill},
            )

        partial_required_keys = {str(item.get("required") or "").casefold() for item in partial_matches}
        for skill in missing_required[:5]:
            if skill.casefold() in partial_required_keys:
                continue
            add_factor(
                factor_type="missing_required_skill",
                factor_key=skill.casefold(),
                factor_label=f"Skill essencial ausente: {skill}",
                impact_score=-priority_slot_impact,
                normalized_weight=weights["priority"],
                direction="negative",
                evidence={"matched": False, "required_skill": skill},
            )

        for partial in partial_matches[:5]:
            required = str(partial.get("required") or "").strip()
            candidate_skill = str(partial.get("candidate") or "").strip()
            partial_score = _to_decimal(partial.get("score"))
            if not required:
                continue
            add_factor(
                factor_type="adjacent_skill_match",
                factor_key=required.casefold(),
                factor_label=f"Experiência adjacente cobre parcialmente {required}",
                impact_score=(priority_slot_impact * partial_score).quantize(Decimal("0.01")),
                normalized_weight=weights["priority"],
                direction="neutral",
                evidence={
                    "required_skill": required,
                    "candidate_skill": candidate_skill,
                    "partial_score": float(partial_score.quantize(Decimal("0.01"))),
                    "reason": partial.get("reason"),
                    "source": partial.get("source"),
                },
            )

        complementary_total = int(
            bd.get("complementary_skills_total")
            or len(complementary_names)
        )
        complementary_matched = int(bd.get("complementary_skills_matched") or 0)
        complementary_missing = len(bd.get("missing_complementary_skills") or [])
        complementary_bonus_cap_slots = int(
            bd.get("complementary_bonus_cap_slots")
            or min(complementary_total, 5)
        )
        complementary_bonus_impact = _to_decimal(
            bd.get("complementary_component_impact")
        )
        if complementary_total > 0:
            bonus_direction = "positive" if complementary_bonus_impact > Decimal("0") else "neutral"
            bonus_label = (
                f"Diferenciais: {complementary_matched}/{complementary_total} encontrados, bônus de {float(complementary_bonus_impact):.2f} pts"
                if complementary_bonus_impact > Decimal("0")
                else f"Diferenciais: {complementary_matched}/{complementary_total} encontrados, sem bônus aplicado"
            )
            add_factor(
                factor_type="complementary_skill_bonus",
                factor_key="complementary_skills",
                factor_label=bonus_label,
                impact_score=complementary_bonus_impact,
                normalized_weight=weights["complementary"],
                direction=bonus_direction,
                evidence={
                    "matched_complementary_skills": list(bd.get("matched_complementary_skills") or []),
                    "missing_complementary_skills": list(bd.get("missing_complementary_skills") or []),
                    "complementary_skills_matched": complementary_matched,
                    "complementary_skills_missing": complementary_missing,
                    "complementary_skills_total": complementary_total,
                    "complementary_bonus_cap_slots": complementary_bonus_cap_slots,
                    "complementary_score_weighted": float(_to_decimal(bd.get("complementary_score_weighted")).quantize(Decimal("0.01"))),
                    "complementary_score_raw_weighted": float(_to_decimal(bd.get("complementary_score_raw_weighted")).quantize(Decimal("0.01"))),
                },
            )

        experience_score = bd["experience_match_score"]
        experience_impact = ((experience_score - Decimal("50")) * Decimal("0.25")).quantize(Decimal("0.01"))
        years = row.get("total_experience_years")
        required_years = job.minimum_years_experience
        add_factor(
            factor_type="experience_match" if experience_score >= Decimal("70") else "insufficient_experience",
            factor_key="experience",
            factor_label=(
                "Experiência atende ou supera o esperado"
                if experience_score >= Decimal("70")
                else "Experiência abaixo do esperado"
            ),
            impact_score=experience_impact,
            normalized_weight=weights["experience"],
            direction="positive" if experience_score >= Decimal("70") else "negative",
            evidence={
                "years_found": float(_to_decimal(years, default=Decimal("0")).quantize(Decimal("0.01"))) if years is not None else 0.0,
                "years_required": float(_to_decimal(required_years, default=Decimal("0")).quantize(Decimal("0.01"))) if required_years is not None else 0.0,
            },
        )

        seniority_score = bd["seniority_match_score"]
        seniority_impact = ((seniority_score - Decimal("50")) * Decimal("0.15")).quantize(Decimal("0.01"))
        add_factor(
            factor_type="seniority_match" if seniority_score >= Decimal("70") else "seniority_gap",
            factor_key="seniority",
            factor_label=(
                "Senioridade alinhada à vaga"
                if seniority_score >= Decimal("70")
                else "Senioridade abaixo da desejada"
            ),
            impact_score=seniority_impact,
            normalized_weight=weights["seniority"],
            direction="positive" if seniority_score >= Decimal("70") else "negative",
            evidence={
                "candidate_seniority": row.get("seniority_level"),
                "job_seniority": job.seniority_level,
            },
        )

        education_score = bd["education_score"]
        if education_score >= Decimal("100"):
            add_factor(
                factor_type="education_match",
                factor_key="education",
                factor_label="Formação compatível com a vaga",
                impact_score=Decimal("5.00"),
                normalized_weight=Decimal("0.10"),
                direction="positive",
                evidence={
                    "candidate_education": row.get("education_level"),
                    "job_education": job.minimum_education_level,
                },
            )

        confidence_score = bd.get("confidence_score", Decimal("0.00"))
        if bd["final_score"] >= Decimal("70.00") and confidence_score < Decimal("50.00"):
            confidence_penalty = ((Decimal("50.00") - confidence_score) / Decimal("4")).quantize(Decimal("0.01"))
            add_factor(
                factor_type="data_confidence_penalty",
                factor_key="matching_confidence",
                factor_label="Baixa confiança dos dados usados no matching",
                impact_score=-confidence_penalty,
                normalized_weight=Decimal("0.05"),
                direction="negative",
                evidence={"confidence_score": float(confidence_score.quantize(Decimal("0.01")))},
            )

        self.validate_score_factors(factors)
        return factors

    def build_reason_codes(self, factors: list[dict[str, Any]]) -> list[dict[str, Any]]:
        codes: list[dict[str, Any]] = []
        for factor in factors:
            factor_type = str(factor.get("factor_type") or "")
            factor_key = str(factor.get("factor_key") or "")
            factor_label = str(factor.get("factor_label") or "")
            impact = float(factor.get("impact_score") or 0.0)

            reason_type = {
                "required_skill_match": "skill_match",
                "missing_required_skill": "missing_skill",
                "complementary_skill_bonus": "desirable_skills",
                "adjacent_skill_match": "adjacent_skill",
                "experience_match": "experience",
                "insufficient_experience": "experience",
                "seniority_match": "seniority",
                "seniority_gap": "seniority",
                "education_match": "education",
                "deal_breaker_violation": "deal_breaker",
                "data_confidence_penalty": "confidence_alert",
            }.get(factor_type, factor_type)

            codes.append({
                "type": reason_type,
                "field": factor_key,
                "impact": impact,
                "description": factor_label,
            })
        return codes

    def validate_score_factors(self, factors: list[dict[str, Any]]) -> None:
        for factor in factors:
            factor_type = str(factor.get("factor_type") or "")
            direction = str(factor.get("direction") or "")
            if factor_type not in _ALLOWED_SCORE_FACTOR_TYPES:
                logger.error("ranking.invalid_factor_type", factor_type=factor_type, factor=factor)
                raise ValueError(f"Unsupported factor_type: {factor_type}")
            if direction not in {"positive", "negative", "neutral"}:
                logger.error("ranking.invalid_factor_direction", direction=direction, factor=factor)
                raise ValueError(f"Unsupported factor direction: {direction}")

    def summarize_score_factors(self, factors: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        grouped: dict[str, list[dict[str, Any]]] = {
            "positive": [],
            "negative": [],
            "contextual": [],
        }
        for factor in sorted(
            factors,
            key=lambda item: abs(float(item.get("impact_score") or 0.0)),
            reverse=True,
        ):
            direction = str(factor.get("direction") or "neutral")
            bucket = "contextual"
            if direction == "positive":
                bucket = "positive"
            elif direction == "negative":
                bucket = "negative"

            if len(grouped[bucket]) >= _SCORE_FACTOR_SUMMARY_LIMIT:
                continue
            grouped[bucket].append({
                "factor_type": str(factor.get("factor_type") or ""),
                "factor_key": str(factor.get("factor_key") or ""),
                "factor_label": str(factor.get("factor_label") or ""),
                "impact_score": float(factor.get("impact_score") or 0.0),
                "direction": direction,
            })
        return grouped

    def render_score_explanation(
        self,
        *,
        final_score: Decimal | float | int,
        decision: str,
        factor_summary: dict[str, list[dict[str, Any]]],
        delta_summary: dict[str, Any] | None,
        breakdown: dict[str, Any] | None = None,
    ) -> str:
        score = float(_to_decimal(final_score).quantize(Decimal("0.01")))
        positives = [item["factor_label"] for item in factor_summary.get("positive", [])[:2]]
        negatives = [item["factor_label"] for item in factor_summary.get("negative", [])[:2]]

        parts = [f"Aderência à vaga em {score:.1f}/100."]
        if breakdown:
            priority_matched = int(breakdown.get("priority_skills_matched") or 0)
            priority_total = int(breakdown.get("priority_skills_total") or 0)
            priority_missing = len(breakdown.get("missing_priority_skills") or breakdown.get("missing_required_skills") or [])
            priority_impact = float(_to_decimal(breakdown.get("priority_component_impact")).quantize(Decimal("0.01")))
            complementary_matched = int(breakdown.get("complementary_skills_matched") or 0)
            complementary_total = int(breakdown.get("complementary_skills_total") or 0)
            complementary_missing = len(breakdown.get("missing_complementary_skills") or [])
            complementary_impact = float(_to_decimal(breakdown.get("complementary_component_impact")).quantize(Decimal("0.01")))
            complementary_bonus_cap_slots = int(breakdown.get("complementary_bonus_cap_slots") or 0)
            eliminatory_missing = list(breakdown.get("missing_eliminatory_skills") or [])
            priority_missing_label = "ausente" if priority_missing == 1 else "ausentes"
            complementary_missing_label = "ausente" if complementary_missing == 1 else "ausentes"
            parts.append(
                f"Essenciais: {priority_matched}/{priority_total} atendidas, {priority_missing} {priority_missing_label}, impacto {priority_impact:.1f} pts."
            )
            if complementary_total > 0:
                parts.append(
                    f"Diferenciais: {complementary_matched}/{complementary_total} encontrados, {complementary_missing} {complementary_missing_label}, bônus {complementary_impact:.1f} pts"
                    f"{f' (cap em {complementary_bonus_cap_slots} skills).' if complementary_bonus_cap_slots > 0 else '.'}"
                )
            else:
                parts.append("Diferenciais: não aplicáveis para esta vaga.")

            has_deal_breaker_violation = any(
                item.get("factor_type") == "deal_breaker_violation"
                for item in factor_summary.get("negative", [])
            )
            if has_deal_breaker_violation:
                parts.append("Critérios eliminatórios: houve bloqueio ativo no ranking.")
            elif eliminatory_missing:
                parts.append(
                    "Critérios eliminatórios: ausência em "
                    + ", ".join(eliminatory_missing[:4])
                    + "."
                )
            else:
                parts.append("Critérios eliminatórios: nenhum bloqueio ativo.")
        if positives:
            parts.append(f"Pontos fortes: {', '.join(positives)}.")
        if negatives:
            parts.append(f"Principais impactos negativos: {', '.join(negatives)}.")

        if delta_summary and delta_summary.get("score_change") not in {None, 0, 0.0}:
            delta_value = float(delta_summary["score_change"])
            if abs(delta_value) >= 5:
                direction = "subiu" if delta_value > 0 else "caiu"
                parts.append(
                    f"O score {direction} {abs(delta_value):.0f} pontos desde o snapshot anterior."
                )

        decision_text = {
            "approved": "Perfil recomendado para avançar.",
            "review": "Perfil pede revisão adicional.",
            "rejected_suggested": "Perfil abaixo do threshold recomendado.",
        }.get(decision)
        if decision_text:
            parts.append(decision_text)
        return " ".join(parts)

    @staticmethod
    def default_factor_summary() -> dict[str, list[dict[str, Any]]]:
        return {"positive": [], "negative": [], "contextual": []}


_default_builder = CandidateRankingExplanationBuilder()


def _build_score_factors(**kwargs: Any) -> list[dict[str, Any]]:
    return _default_builder.build_score_factors(**kwargs)


def _build_reason_codes(factors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return _default_builder.build_reason_codes(factors)


def _validate_score_factors(factors: list[dict[str, Any]]) -> None:
    _default_builder.validate_score_factors(factors)


def _summarize_score_factors(factors: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    return _default_builder.summarize_score_factors(factors)


def _render_score_explanation(
    *,
    final_score: Decimal | float | int,
    decision: str,
    factor_summary: dict[str, list[dict[str, Any]]],
    delta_summary: dict[str, Any] | None,
    breakdown: dict[str, Any] | None = None,
) -> str:
    return _default_builder.render_score_explanation(
        final_score=final_score,
        decision=decision,
        factor_summary=factor_summary,
        delta_summary=delta_summary,
        breakdown=breakdown,
    )


def _default_factor_summary() -> dict[str, list[dict[str, Any]]]:
    return _default_builder.default_factor_summary()
