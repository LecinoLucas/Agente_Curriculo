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
from typing import Any

from src.domain.value_objects.score import Score, ScoreBreakdown

# ── Constantes de regras ─────────────────────────────────────────────────────

# Pesos das dimensões no overall score (soma = 1.0)
_DIMENSION_WEIGHTS = {
    "technical": 0.35,
    "experience": 0.30,
    "education": 0.15,
    "communication": 0.10,
    "leadership": 0.10,
}

# Mapeamento de nível de educação para pontuação base
_EDUCATION_SCORES: dict[str, float] = {
    "none": 10.0,
    "high_school": 25.0,
    "technical": 40.0,
    "bachelor": 62.0,
    "postgraduate": 72.0,
    "master": 83.0,
    "phd": 95.0,
}

# Bônus de relevância da área de formação (por tipo de vaga detectado)
_EDUCATION_RELEVANCE_BONUS = {"high": 10.0, "medium": 5.0, "low": 0.0}

# Bônus por certificação relevante (máx: 10 pontos)
_CERTIFICATION_BONUS_PER_ITEM = 2.5
_CERTIFICATION_BONUS_MAX = 10.0

# Penalidade por gap de emprego > 6 meses
_GAP_PENALTY_PER_OCCURRENCE = 5.0

# Score base por faixa de experiência total (em anos)
_EXPERIENCE_BAND_SCORES: list[tuple[float, float]] = [
    (0.0, 5.0),    # < 1 ano
    (1.0, 25.0),   # 1 ano
    (2.0, 40.0),   # 2 anos
    (3.0, 55.0),   # 3 anos
    (5.0, 68.0),   # 5 anos
    (7.0, 78.0),   # 7 anos
    (10.0, 88.0),  # 10 anos
    (12.0, 95.0),  # 12+ anos → cap em 95 (100 reservado para > 15 anos)
    (15.0, 100.0),
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
    """

    def calculate(self, data: ExtractedResumeData) -> ScoreBreakdown:
        technical = self._calculate_technical(data)
        experience = self._calculate_experience(data)
        education = self._calculate_education(data)
        communication = self._calculate_communication(data)
        leadership = self._calculate_leadership(data)

        overall = Score.of(
            float(technical.value) * _DIMENSION_WEIGHTS["technical"]
            + float(experience.value) * _DIMENSION_WEIGHTS["experience"]
            + float(education.value) * _DIMENSION_WEIGHTS["education"]
            + float(communication.value) * _DIMENSION_WEIGHTS["communication"]
            + float(leadership.value) * _DIMENSION_WEIGHTS["leadership"]
        )

        details = {
            "weights": _DIMENSION_WEIGHTS,
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
            return Score.of(5.0)

        # Profundidade: média ponderada de proficiency
        proficiency_map = {"basic": 25, "intermediate": 50, "advanced": 75, "expert": 100}
        total_proficiency = sum(
            proficiency_map.get(s.get("proficiency_level", "basic"), 25) for s in skills
        )
        depth_score = total_proficiency / len(skills)

        # Amplitude: cobertura de categorias (cada categoria = 10 pontos, máx 100)
        num_categories = len(set(data.skill_categories))
        breadth_score = min(num_categories * 12.5, 100.0)

        # Skills primárias (expert ou marcadas como primary)
        expert_count = sum(1 for s in skills if s.get("proficiency_level") == "expert")
        primary_score = min(expert_count * 20.0, 100.0)

        return Score.of(
            depth_score * 0.50 + breadth_score * 0.30 + primary_score * 0.20
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
        years = data.total_experience_months / 12.0
        base = self._experience_base_score(years)

        # Bônus por experiência em liderança ou gestão
        leadership_bonus = 0.0
        if any(e.get("is_leadership") for e in data.experiences):
            leadership_bonus = 8.0

        # Penalidade por gaps de emprego significativos (> 6 meses)
        significant_gaps = [
            g for g in data.employment_gaps
            if g.get("duration_months", 0) > 6
        ]
        gap_penalty = len(significant_gaps) * _GAP_PENALTY_PER_OCCURRENCE

        raw = base + leadership_bonus - gap_penalty
        return Score.of(raw)

    def _experience_base_score(self, years: float) -> float:
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
        base = _EDUCATION_SCORES.get(data.highest_education_level, 10.0)
        relevance_bonus = _EDUCATION_RELEVANCE_BONUS.get(data.education_field_relevance, 0.0)
        cert_bonus = min(
            len(data.certifications) * _CERTIFICATION_BONUS_PER_ITEM,
            _CERTIFICATION_BONUS_MAX,
        )
        return Score.of(base + relevance_bonus + cert_bonus)

    def _education_detail(self, data: ExtractedResumeData) -> dict:
        return {
            "highest_level": data.highest_education_level,
            "field_relevance": data.education_field_relevance,
            "certifications_count": len(data.certifications),
            "base_score": _EDUCATION_SCORES.get(data.highest_education_level, 10.0),
        }

    # ── Communication (10%) ──────────────────────────────────────────────────
    # Baseado na avaliação qualitativa da IA sobre o documento em si.
    # Critérios: estrutura (30%), clareza (30%), profissionalismo (20%), completude (20%)

    def _calculate_communication(self, data: ExtractedResumeData) -> Score:
        q = data.communication_quality
        if not q:
            return Score.of(50.0)  # default neutro quando dado ausente

        structure = float(q.get("structure", 50))
        clarity = float(q.get("clarity", 50))
        professionalism = float(q.get("professionalism", 50))
        completeness = float(q.get("completeness", 50))

        return Score.of(
            structure * 0.30
            + clarity * 0.30
            + professionalism * 0.20
            + completeness * 0.20
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

    _LEADERSHIP_WEIGHTS = {
        "has_management": 40.0,
        "has_project_lead": 30.0,
        "has_mentoring": 20.0,
        "has_cross_team": 10.0,
    }

    def _calculate_leadership(self, data: ExtractedResumeData) -> Score:
        indicators = data.leadership_indicators
        if not indicators:
            return Score.of(0.0)

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
