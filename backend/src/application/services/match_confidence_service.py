from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


def _clamp(value: Decimal, minimum: Decimal = Decimal("0"), maximum: Decimal = Decimal("100")) -> Decimal:
    return max(minimum, min(maximum, value))


@dataclass(frozen=True, slots=True)
class MatchConfidenceAssessment:
    confidence_score: Decimal
    reasons: tuple[str, ...]
    overestimation_risks: tuple[str, ...]
    low_confidence_alert: bool


def compute_match_confidence(
    *,
    final_score: Decimal | float | int | None,
    structured_mandatory_skill_count: int,
    structured_total_skill_count: int,
    has_job_seniority: bool,
    has_job_min_experience: bool,
    candidate_structured_skill_count: int,
    candidate_has_experience: bool,
    candidate_has_education: bool,
) -> MatchConfidenceAssessment:
    score = Decimal("0")
    reasons: list[str] = []
    risks: list[str] = []

    if structured_mandatory_skill_count >= 2:
        score += Decimal("30")
    elif structured_mandatory_skill_count == 1:
        score += Decimal("15")
        reasons.append("A vaga tem apenas 1 skill obrigatória estruturada.")
    else:
        score -= Decimal("25")
        reasons.append("A vaga não tem skills obrigatórias estruturadas.")
        risks.append("A vaga não tem skills obrigatórias estruturadas; o match pode estar superestimado.")

    if has_job_seniority and has_job_min_experience:
        score += Decimal("20")
    elif has_job_seniority or has_job_min_experience:
        score += Decimal("10")
        reasons.append("A vaga está parcialmente estruturada em senioridade/experiência.")
    else:
        reasons.append("A vaga não informa senioridade nem experiência mínima.")

    if candidate_structured_skill_count > 0:
        score += Decimal("20")
    else:
        score -= Decimal("10")
        reasons.append("O candidato não tem skills estruturadas suficientes no profile.")

    if candidate_has_experience:
        score += Decimal("15")
    else:
        reasons.append("O candidato não tem experiência estimada estruturada.")

    if candidate_has_education:
        score += Decimal("15")
    else:
        reasons.append("O candidato não tem educação estruturada.")

    if not candidate_has_experience and not candidate_has_education:
        score -= Decimal("10")
        risks.append("Faltam experiência e educação estruturadas do candidato.")

    has_sufficient_data = any(
        (
            structured_total_skill_count > 0,
            has_job_seniority,
            has_job_min_experience,
            candidate_structured_skill_count > 0,
            candidate_has_experience,
            candidate_has_education,
        )
    )

    score = _clamp(score)
    if has_sufficient_data and score == Decimal("0"):
        score = Decimal("15")

    score = score.quantize(Decimal("0.01"))
    normalized_final_score = Decimal(str(final_score or 0))
    low_confidence_alert = normalized_final_score >= Decimal("70") and score < Decimal("50")
    if low_confidence_alert:
        risks.append("Score alto com baixa confiança dos dados; revisar cadastro e extração antes de decidir.")

    return MatchConfidenceAssessment(
        confidence_score=score,
        reasons=tuple(dict.fromkeys(reasons)),
        overestimation_risks=tuple(dict.fromkeys(risks)),
        low_confidence_alert=low_confidence_alert,
    )
