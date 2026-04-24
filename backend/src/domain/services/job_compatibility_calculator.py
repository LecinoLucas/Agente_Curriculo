"""
JobCompatibilityCalculator — Serviço de domínio puro.

Calcula a compatibilidade entre um candidato (resultado de análise) e
uma vaga (conjunto de requisitos), produzindo um match score e recomendação.

REGRAS DE MATCHING (v1):
─────────────────────────────────────────────────────────────────────────────
Dimensão                Peso   Critério de pontuação
─────────────────────────────────────────────────────────────────────────────
Skills obrigatórias     40%    Cobertura ponderada pelos pesos da vaga
Skills opcionais        20%    Bônus por skills desejáveis presentes
Senioridade             20%    Adequação ao nível exigido
Experiência (anos)      10%    Atendimento ao mínimo de anos
Educação                10%    Atendimento ao nível educacional mínimo
─────────────────────────────────────────────────────────────────────────────

Proficiency partial credit (para skills obrigatórias com nível mínimo):
  Nível abaixo do mínimo  → 50% de crédito (não é bloqueante, mas penaliza)
  Nível igual ao mínimo   → 100% de crédito
  Nível acima do mínimo   → 100% de crédito + flag "exceeds_requirement"

Recomendações:
  STRONG_MATCH   → match_score ≥ 82 AND mandatory_skills_coverage ≥ 90%
  GOOD_MATCH     → match_score ≥ 65 AND mandatory_skills_coverage ≥ 75%
  POTENTIAL      → match_score ≥ 45 AND mandatory_skills_coverage ≥ 50%
  NOT_RECOMMENDED → demais casos
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from src.domain.entities.analysis import SeniorityLevel
from src.domain.value_objects.score import Score
from src.domain.value_objects.skill_set import PROFICIENCY_RANK, RequiredSkill, SkillSet

# Ordem dos níveis de senioridade (para cálculo de distância)
_SENIORITY_ORDER: list[SeniorityLevel] = [
    SeniorityLevel.INTERN,
    SeniorityLevel.JUNIOR,
    SeniorityLevel.MID,
    SeniorityLevel.SENIOR,
    SeniorityLevel.LEAD,
    SeniorityLevel.PRINCIPAL,
    SeniorityLevel.DIRECTOR,
]

# Score de seniority por distância de níveis (|candidato_rank - vaga_rank|)
_SENIORITY_DISTANCE_SCORES: dict[int, float] = {
    0: 100.0,   # nível exato
    1: 75.0,    # ±1 nível
    2: 45.0,    # ±2 níveis
    3: 20.0,    # ±3 níveis
}

# Mapeamento de nível educacional para rank numérico
_EDUCATION_RANK: dict[str, int] = {
    "none": 0,
    "high_school": 1,
    "technical": 2,
    "bachelor": 3,
    "postgraduate": 4,
    "master": 5,
    "phd": 6,
}

# Score de educação por distância abaixo do mínimo (0 = atende, 1 = 1 nível abaixo, etc.)
_EDUCATION_DISTANCE_SCORES: dict[int, float] = {
    0: 100.0,
    1: 60.0,
    2: 30.0,
}


@dataclass(frozen=True)
class CompatibilityInput:
    candidate_skills: SkillSet
    required_skills: list[RequiredSkill]
    candidate_seniority: SeniorityLevel
    candidate_experience_years: float
    candidate_education_level: str
    job_seniority: Optional[SeniorityLevel] = None
    job_min_experience_years: Optional[float] = None
    job_min_education_level: Optional[str] = None


@dataclass
class SkillMatchDetail:
    skill_name: str
    is_mandatory: bool
    candidate_has: bool
    candidate_level: Optional[str]
    required_level: Optional[str]
    meets_level: bool
    partial_credit: bool
    credit: float                     # crédito aplicado (0.0, 0.5 ou 1.0 × peso)
    exceeds_requirement: bool = False


@dataclass(frozen=True)
class CompatibilityResult:
    match_score: Score
    mandatory_skills_score: Score
    optional_skills_score: Score
    seniority_score: Score
    experience_score: Score
    education_score: Score

    mandatory_skills_coverage: float  # % de skills obrigatórias cobertas (0-100)
    recommendation: str               # STRONG_MATCH | GOOD_MATCH | POTENTIAL | NOT_RECOMMENDED

    matched_skills: list[str]         # skills que o candidato possui
    missing_mandatory_skills: list[str]
    missing_optional_skills: list[str]
    bonus_skills: list[str]           # skills do candidato além dos requisitos
    exceeds_skills: list[str]         # skills onde o candidato supera o nível mínimo
    match_summary: str

    skill_details: list[SkillMatchDetail] = field(default_factory=list)


class JobCompatibilityCalculator:
    """
    Calcula compatibilidade candidato × vaga.
    Zero dependências externas — puro domínio, 100% testável e auditável.
    """

    _DIMENSION_WEIGHTS = {
        "mandatory_skills": 0.40,
        "optional_skills": 0.20,
        "seniority": 0.20,
        "experience": 0.10,
        "education": 0.10,
    }

    def calculate(self, data: CompatibilityInput) -> CompatibilityResult:
        mandatory = [s for s in data.required_skills if s.is_mandatory]
        optional = [s for s in data.required_skills if not s.is_mandatory]

        mandatory_score, mandatory_details = self._score_skills(data.candidate_skills, mandatory)
        optional_score, optional_details = self._score_skills(data.candidate_skills, optional)
        seniority_score = self._score_seniority(data.candidate_seniority, data.job_seniority)
        experience_score = self._score_experience(
            data.candidate_experience_years, data.job_min_experience_years
        )
        education_score = self._score_education(
            data.candidate_education_level, data.job_min_education_level
        )

        all_details = mandatory_details + optional_details

        overall = Score.of(
            float(mandatory_score.value) * self._DIMENSION_WEIGHTS["mandatory_skills"]
            + float(optional_score.value) * self._DIMENSION_WEIGHTS["optional_skills"]
            + float(seniority_score.value) * self._DIMENSION_WEIGHTS["seniority"]
            + float(experience_score.value) * self._DIMENSION_WEIGHTS["experience"]
            + float(education_score.value) * self._DIMENSION_WEIGHTS["education"]
        )

        # Cobertura percentual das skills obrigatórias (ignora peso/proficiency)
        covered_mandatory = sum(1 for d in mandatory_details if d.candidate_has)
        mandatory_coverage = (
            (covered_mandatory / len(mandatory) * 100.0) if mandatory else 100.0
        )

        recommendation = self._recommend(
            match_score=float(overall.value),
            mandatory_coverage=mandatory_coverage,
        )

        return CompatibilityResult(
            match_score=overall,
            mandatory_skills_score=mandatory_score,
            optional_skills_score=optional_score,
            seniority_score=seniority_score,
            experience_score=experience_score,
            education_score=education_score,
            mandatory_skills_coverage=mandatory_coverage,
            recommendation=recommendation,
            matched_skills=[d.skill_name for d in all_details if d.candidate_has],
            missing_mandatory_skills=[
                d.skill_name for d in mandatory_details if not d.candidate_has
            ],
            missing_optional_skills=[
                d.skill_name for d in optional_details if not d.candidate_has
            ],
            bonus_skills=self._find_bonus_skills(data.candidate_skills, data.required_skills),
            exceeds_skills=[d.skill_name for d in all_details if d.exceeds_requirement],
            match_summary=self._build_summary(
                overall, mandatory_coverage, recommendation, mandatory_details
            ),
            skill_details=all_details,
        )

    # ── Skills ───────────────────────────────────────────────────────────────

    def _score_skills(
        self, candidate: SkillSet, required: list[RequiredSkill]
    ) -> tuple[Score, list[SkillMatchDetail]]:
        if not required:
            return Score.perfect(), []

        total_weight = sum(float(r.weight) for r in required)
        earned_weight = 0.0
        details: list[SkillMatchDetail] = []

        for req in required:
            entry = candidate.find(req.skill_id)
            has = entry is not None

            if has and entry is not None:
                meets_level = entry.meets_minimum_level(req.minimum_level)
                partial = not meets_level
                credit = 0.5 if partial else 1.0
                exceeds = (
                    entry.proficiency_rank > PROFICIENCY_RANK.get(req.minimum_level or "basic", 1)
                    if req.minimum_level else False
                )
                earned_weight += credit * float(req.weight)
            else:
                meets_level = False
                partial = False
                credit = 0.0
                exceeds = False

            details.append(
                SkillMatchDetail(
                    skill_name=req.skill_name,
                    is_mandatory=req.is_mandatory,
                    candidate_has=has,
                    candidate_level=entry.proficiency_level if entry else None,
                    required_level=req.minimum_level,
                    meets_level=meets_level,
                    partial_credit=partial,
                    credit=credit,
                    exceeds_requirement=exceeds,
                )
            )

        score = (earned_weight / total_weight * 100.0) if total_weight > 0 else 100.0
        return Score.of(score), details

    # ── Senioridade ──────────────────────────────────────────────────────────

    @staticmethod
    def _score_seniority(
        candidate: SeniorityLevel, required: Optional[SeniorityLevel]
    ) -> Score:
        if required is None:
            return Score.perfect()

        candidate_rank = _SENIORITY_ORDER.index(candidate)
        required_rank = _SENIORITY_ORDER.index(required)
        distance = abs(candidate_rank - required_rank)

        # Candidato ACIMA do requisito: leve penalidade (pode estar sobre-qualificado)
        if candidate_rank > required_rank:
            distance_score = _SENIORITY_DISTANCE_SCORES.get(distance, 10.0)
            # Reduz 10% se acima (sobre-qualificado pode recusar ou pedir mais $)
            return Score.of(distance_score * 0.90)

        return Score.of(_SENIORITY_DISTANCE_SCORES.get(distance, 10.0))

    # ── Experiência em anos ───────────────────────────────────────────────────

    @staticmethod
    def _score_experience(
        candidate_years: float, min_years: Optional[float]
    ) -> Score:
        if min_years is None or min_years == 0:
            return Score.perfect()

        ratio = candidate_years / min_years

        if ratio >= 1.0:
            return Score.perfect()
        if ratio >= 0.80:
            return Score.of(75.0)
        if ratio >= 0.60:
            return Score.of(50.0)
        if ratio >= 0.40:
            return Score.of(25.0)
        return Score.of(10.0)

    # ── Educação ─────────────────────────────────────────────────────────────

    @staticmethod
    def _score_education(
        candidate_level: str, min_level: Optional[str]
    ) -> Score:
        if min_level is None:
            return Score.perfect()

        candidate_rank = _EDUCATION_RANK.get(candidate_level, 0)
        required_rank = _EDUCATION_RANK.get(min_level, 0)
        distance = max(0, required_rank - candidate_rank)  # apenas déficit é penalizado

        return Score.of(_EDUCATION_DISTANCE_SCORES.get(distance, 10.0))

    # ── Recomendação ─────────────────────────────────────────────────────────

    @staticmethod
    def _recommend(match_score: float, mandatory_coverage: float) -> str:
        if match_score >= 82 and mandatory_coverage >= 90:
            return "strong_match"
        if match_score >= 65 and mandatory_coverage >= 75:
            return "good_match"
        if match_score >= 45 and mandatory_coverage >= 50:
            return "potential"
        return "not_recommended"

    # ── Skills bônus (candidato tem skills além dos requisitos) ──────────────

    @staticmethod
    def _find_bonus_skills(
        candidate: SkillSet, required: list[RequiredSkill]
    ) -> list[str]:
        required_ids = {r.skill_id for r in required}
        return [
            entry.skill_name
            for entry in candidate.entries
            if entry.skill_id not in required_ids
        ]

    # ── Resumo textual ───────────────────────────────────────────────────────

    @staticmethod
    def _build_summary(
        overall: Score,
        mandatory_coverage: float,
        recommendation: str,
        mandatory_details: list[SkillMatchDetail],
    ) -> str:
        missing = [d.skill_name for d in mandatory_details if not d.candidate_has]
        label_map = {
            "strong_match": "Candidato fortemente compatível com a vaga.",
            "good_match": "Candidato compatível com a vaga.",
            "potential": "Candidato parcialmente compatível. Requer avaliação.",
            "not_recommended": "Candidato não atende aos requisitos mínimos da vaga.",
        }
        summary = label_map.get(recommendation, "")
        if missing:
            summary += f" Skills obrigatórias ausentes: {', '.join(missing[:5])}."
        summary += (
            f" Score geral: {float(overall.value):.1f}/100. "
            f"Cobertura de skills obrigatórias: {mandatory_coverage:.0f}%."
        )
        return summary
