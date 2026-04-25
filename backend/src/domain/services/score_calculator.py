"""
ScoreCalculator — Serviço de domínio puro.

Responsabilidade única: receber os dados estruturados extraídos pela IA
e produzir um ScoreBreakdown completo e auditável.

REGRAS DE SCORING (v1):
───────────────────────────────────────────────────────────────
Dimensão         Peso   Critérios
───────────────────────────────────────────────────────────────
Technical        35%    Profundidade e amplitude de skills
Experience       30%    Anos totais + relevância + liderança
Education        15%    Nível + relevância da área
Communication    10%    Estrutura, clareza e profissionalismo
Leadership       10%    Gestão, mentoria, liderança de projetos
───────────────────────────────────────────────────────────────
"""

from dataclasses import dataclass
from decimal import Decimal

from src.domain.value_objects.score import Score, ScoreBreakdown

# ── Constantes de regras ─────────────────────────────────────────────────────

_DIMENSION_WEIGHTS: dict[str, Decimal] = {
    "technical": Decimal("0.35"),
    "experience": Decimal("0.30"),
    "education": Decimal("0.15"),
    "communication": Decimal("0.10"),
    "leadership": Decimal("0.10"),
}

_PROFICIENCY_SCORES: dict[str, Decimal] = {
    "basic": Decimal("25"),
    "intermediate": Decimal("50"),
    "advanced": Decimal("75"),
    "expert": Decimal("100"),
}
_DEFAULT_PROFICIENCY = Decimal("25")

_EDUCATION_SCORES: dict[str, Decimal] = {
    "none": Decimal("10"),
    "high_school": Decimal("25"),
    "technical": Decimal("40"),
    "bachelor": Decimal("62"),
    "postgraduate": Decimal("72"),
    "master": Decimal("83"),
    "phd": Decimal("95"),
}

_EDUCATION_RELEVANCE_BONUS: dict[str, Decimal] = {
    "high": Decimal("10"),
    "medium": Decimal("5"),
    "low": Decimal("0"),
}

_CERTIFICATION_BONUS_PER_ITEM = Decimal("2.5")
_CERTIFICATION_BONUS_MAX = Decimal("10")

_GAP_PENALTY_PER_OCCURRENCE = Decimal("5")

_EXPERIENCE_BAND_SCORES: list[tuple[Decimal, Decimal]] = [
    (Decimal("0"), Decimal("5")),
    (Decimal("1"), Decimal("25")),
    (Decimal("2"), Decimal("40")),
    (Decimal("3"), Decimal("55")),
    (Decimal("5"), Decimal("68")),
    (Decimal("7"), Decimal("78")),
    (Decimal("10"), Decimal("88")),
    (Decimal("12"), Decimal("95")),
    (Decimal("15"), Decimal("100")),
]


@dataclass(frozen=True)
class ExtractedResumeData:
    """
    Estrutura normalizada do que a IA extrai do currículo.
    Serve de contrato entre o adaptador de IA e o calculador de score.
    """

    # Experiência profissional
    total_experience_months: int
    experiences: list[dict]        # cada item: company, role, duration_months, is_leadership
    employment_gaps: list[dict]    # períodos sem emprego > 1 mês

    # Skills
    skills: list[dict]             # name, proficiency_level, years_experience
    skill_categories: list[str]    # categorias cobertas

    # Educação
    highest_education_level: str   # none|high_school|technical|bachelor|postgraduate|master|phd
    education_field_relevance: str # high|medium|low — avaliado pela IA com base no contexto
    certifications: list[dict]     # certifications relevantes detectadas

    # Qualidade do documento (avaliada pela IA, escala 0-100 por sub-critério)
    communication_quality: dict    # structure, clarity, professionalism, completeness

    # Indicadores de liderança (booleans detectados pela IA)
    leadership_indicators: dict    # has_management, has_project_lead, has_mentoring, has_cross_team


class ScoreCalculator:
    """
    Calcula scores de análise a partir de dados estruturados extraídos da IA.
    Zero dependências externas — puro domínio, 100% testável.
    Toda aritmética interna usa Decimal.
    """

    def calculate(self, data: ExtractedResumeData) -> ScoreBreakdown:
        technical = self._calculate_technical(data)
        experience = self._calculate_experience(data)
        education = self._calculate_education(data)
        communication = self._calculate_communication(data)
        leadership = self._calculate_leadership(data)

        overall = Score.of(
            technical.value * _DIMENSION_WEIGHTS["technical"]
            + experience.value * _DIMENSION_WEIGHTS["experience"]
            + education.value * _DIMENSION_WEIGHTS["education"]
            + communication.value * _DIMENSION_WEIGHTS["communication"]
            + leadership.value * _DIMENSION_WEIGHTS["leadership"]
        )

        details = {
            "weights": {k: float(v) for k, v in _DIMENSION_WEIGHTS.items()},
            "technical_detail": self._technical_detail(data),
            "experience_detail": self._experience_detail(data),
            "education_detail": self._education_detail(data),
            "communication_detail": self._communication_detail(data),
            "leadership_detail": self._leadership_detail(data),
        }

        return ScoreBreakdown(
            overall=overall,
            technical=technical,
            experience=experience,
            education=education,
            communication=communication,
            leadership=leadership,
            details=details,
        )

    # ── Technical (35%) ──────────────────────────────────────────────────────
    # Fórmula: profundidade × 0.50 + amplitude × 0.30 + skills primárias × 0.20

    def _calculate_technical(self, data: ExtractedResumeData) -> Score:
        skills = data.skills
        if not skills:
            return Score.of(5)

        total_proficiency = sum(
            _PROFICIENCY_SCORES.get(s.get("proficiency_level", "basic"), _DEFAULT_PROFICIENCY)
            for s in skills
        )
        depth_score = total_proficiency / len(skills)

        num_categories = len(set(data.skill_categories))
        breadth_score = min(Decimal(num_categories) * Decimal("12.5"), Decimal("100"))

        expert_count = sum(1 for s in skills if s.get("proficiency_level") == "expert")
        primary_score = min(Decimal(expert_count) * Decimal("20"), Decimal("100"))

        return Score.of(
            depth_score * Decimal("0.50")
            + breadth_score * Decimal("0.30")
            + primary_score * Decimal("0.20")
        )

    def _technical_detail(self, data: ExtractedResumeData) -> dict:
        return {
            "total_skills": len(data.skills),
            "categories": data.skill_categories,
            "expert_skills": [
                s["name"] for s in data.skills if s.get("proficiency_level") == "expert"
            ],
        }

    # ── Experience (30%) ─────────────────────────────────────────────────────
    # Fórmula: score_base_por_anos + bônus_liderança - penalidade_gaps

    def _calculate_experience(self, data: ExtractedResumeData) -> Score:
        years = Decimal(data.total_experience_months) / Decimal("12")
        base = self._experience_base_score(years)

        leadership_bonus = Decimal("0")
        if any(e.get("is_leadership") for e in data.experiences):
            leadership_bonus = Decimal("8")

        significant_gaps = [
            g for g in data.employment_gaps
            if g.get("duration_months", 0) > 6
        ]
        gap_penalty = len(significant_gaps) * _GAP_PENALTY_PER_OCCURRENCE

        return Score.of(base + leadership_bonus - gap_penalty)

    def _experience_base_score(self, years: Decimal) -> Decimal:
        base = _EXPERIENCE_BAND_SCORES[0][1]
        for min_years, score in _EXPERIENCE_BAND_SCORES:
            if years >= min_years:
                base = score
            else:
                break
        return base

    def _experience_detail(self, data: ExtractedResumeData) -> dict:
        return {
            "total_experience_years": round(data.total_experience_months / 12, 1),
            "total_companies": len(data.experiences),
            "has_leadership_roles": any(e.get("is_leadership") for e in data.experiences),
            "significant_gaps_count": sum(
                1 for g in data.employment_gaps if g.get("duration_months", 0) > 6
            ),
        }

    # ── Education (15%) ──────────────────────────────────────────────────────
    # Fórmula: score_base_nivel + bônus_relevância + bônus_certificações

    def _calculate_education(self, data: ExtractedResumeData) -> Score:
        base = _EDUCATION_SCORES.get(data.highest_education_level, Decimal("10"))
        relevance_bonus = _EDUCATION_RELEVANCE_BONUS.get(data.education_field_relevance, Decimal("0"))
        cert_bonus = min(
            Decimal(len(data.certifications)) * _CERTIFICATION_BONUS_PER_ITEM,
            _CERTIFICATION_BONUS_MAX,
        )
        return Score.of(base + relevance_bonus + cert_bonus)

    def _education_detail(self, data: ExtractedResumeData) -> dict:
        return {
            "highest_level": data.highest_education_level,
            "field_relevance": data.education_field_relevance,
            "certifications_count": len(data.certifications),
            "base_score": float(_EDUCATION_SCORES.get(data.highest_education_level, Decimal("10"))),
        }

    # ── Communication (10%) ──────────────────────────────────────────────────
    # Baseado na avaliação qualitativa da IA sobre o documento em si.
    # Critérios: estrutura (30%), clareza (30%), profissionalismo (20%), completude (20%)

    def _calculate_communication(self, data: ExtractedResumeData) -> Score:
        q = data.communication_quality
        if not q:
            return Score.of(50)

        structure = Decimal(str(q.get("structure", 50)))
        clarity = Decimal(str(q.get("clarity", 50)))
        professionalism = Decimal(str(q.get("professionalism", 50)))
        completeness = Decimal(str(q.get("completeness", 50)))

        return Score.of(
            structure * Decimal("0.30")
            + clarity * Decimal("0.30")
            + professionalism * Decimal("0.20")
            + completeness * Decimal("0.20")
        )

    def _communication_detail(self, data: ExtractedResumeData) -> dict:
        return data.communication_quality

    # ── Leadership (10%) ─────────────────────────────────────────────────────
    # Fórmula: cada indicador tem um peso fixo. Soma = score de liderança.
    # Indicadores:
    #   has_management     → 40 pontos  (gestão de pessoas)
    #   has_project_lead   → 30 pontos  (liderança de projeto/produto)
    #   has_mentoring      → 20 pontos  (mentoria / desenvolvimento de equipe)
    #   has_cross_team     → 10 pontos  (colaboração entre times/áreas)

    _LEADERSHIP_WEIGHTS: dict[str, Decimal] = {
        "has_management": Decimal("40"),
        "has_project_lead": Decimal("30"),
        "has_mentoring": Decimal("20"),
        "has_cross_team": Decimal("10"),
    }

    def _calculate_leadership(self, data: ExtractedResumeData) -> Score:
        indicators = data.leadership_indicators
        if not indicators:
            return Score.of(0)

        total = sum(
            weight
            for key, weight in self._LEADERSHIP_WEIGHTS.items()
            if indicators.get(key, False)
        )
        return Score.of(total)

    def _leadership_detail(self, data: ExtractedResumeData) -> dict:
        return {
            k: bool(data.leadership_indicators.get(k, False))
            for k in self._LEADERSHIP_WEIGHTS
        }
