"""
SeniorityClassifier — Serviço de domínio puro.

Classifica o nível de senioridade de um candidato com base em
múltiplos sinais combinados (experiência, responsabilidades, skills).

REGRAS DE CLASSIFICAÇÃO (v1):
─────────────────────────────────────────────────────────────────────────────
Nível       Anos mín.  Sinal primário          Sinais de confirmação
─────────────────────────────────────────────────────────────────────────────
intern      —          < 1 ano OU explícito    estágio, trainee
junior      1 ano      1–2 anos                suporte, assistência
mid         3 anos     3–4 anos                trabalho autônomo
senior      5 anos     5–6 anos                mentoria, design de sistemas
lead        7 anos     7+ anos + liderança     gestão de equipe ou principal eng.
principal   10 anos    10+ anos + expertise    liderança técnica multi-time
director    12 anos    12+ anos + gestão       gestão de gestores, impacto org.
─────────────────────────────────────────────────────────────────────────────

Mecanismo de ajuste:
  · Palavras-chave de responsabilidade nos cargos elevam o nível detectado
  · Baixa profundidade técnica pode rebaixar o nível
  · O sinal primário (anos) nunca é ignorado: é o piso mínimo
"""

from dataclasses import dataclass
from typing import Optional

from src.domain.entities.analysis import SeniorityLevel

# ── Padrões de palavras-chave por nível ──────────────────────────────────────
# Detectados nos títulos de cargo e nas descrições de atividades.
# Aplicados em ordem decrescente de senioridade (primeiro match vence no upward adjustment).

_ROLE_KEYWORDS: dict[str, list[str]] = {
    "director": [
        "director", "diretor", "vp ", "vice president", "head of", "cto", "cpo",
        "chief", "managing director",
    ],
    "principal": [
        "principal", "staff engineer", "distinguished", "fellow", "architect",
        "arquiteto", "tech lead", "technical lead", "liderança técnica",
    ],
    "lead": [
        "lead", "líder", "lider", "manager", "gerente", "coordinator",
        "coordenador", "team lead", "scrum master", "engineering manager",
    ],
    "senior": [
        "senior", "sênior", "sr.", "sr ", "especialista", "specialist",
        "pleno avançado",
    ],
    "mid": [
        "pleno", "mid ", "mid-level", "intermediário",
    ],
    "junior": [
        "junior", "júnior", "jr.", "jr ", "trainee", "associate",
    ],
    "intern": [
        "estagiário", "estágio", "intern", "interne", "apprentice",
    ],
}

# ── Regras de experiência: (anos_mínimos, nível_base) ────────────────────────
# Aplicadas em ordem decrescente: primeiro match → nível base.
_EXPERIENCE_RULES: list[tuple[float, SeniorityLevel]] = [
    (12.0, SeniorityLevel.DIRECTOR),
    (10.0, SeniorityLevel.PRINCIPAL),
    (7.0, SeniorityLevel.LEAD),
    (5.0, SeniorityLevel.SENIOR),
    (3.0, SeniorityLevel.MID),
    (1.0, SeniorityLevel.JUNIOR),
    (0.0, SeniorityLevel.INTERN),
]

# Ordem dos níveis (para comparação / ajuste)
_LEVEL_ORDER: list[SeniorityLevel] = [
    SeniorityLevel.INTERN,
    SeniorityLevel.JUNIOR,
    SeniorityLevel.MID,
    SeniorityLevel.SENIOR,
    SeniorityLevel.LEAD,
    SeniorityLevel.PRINCIPAL,
    SeniorityLevel.DIRECTOR,
]


@dataclass(frozen=True)
class SeniorityInput:
    total_experience_months: int
    roles_text: str                    # título + descrição de todos os cargos (lowercase)
    has_management_experience: bool
    has_project_leadership: bool
    average_skill_proficiency: float   # 1.0 (basic) a 4.0 (expert)
    explicit_level: Optional[str]      # nível explicitamente declarado no currículo (pode ser None)


@dataclass(frozen=True)
class SeniorityResult:
    level: SeniorityLevel
    confidence: str                    # "high" | "medium" | "low"
    reasoning: str
    years_of_experience: float
    keyword_detected: Optional[str]    # palavra-chave que influenciou a decisão


class SeniorityClassifier:
    """
    Classifica o nível de senioridade usando regras determinísticas.
    Zero dependências externas — puro domínio, 100% testável e auditável.
    """

    def classify(self, data: SeniorityInput) -> SeniorityResult:
        years = data.total_experience_months / 12.0
        experience_level = self._level_from_experience(years)
        keyword_level, keyword = self._level_from_keywords(data.roles_text)
        adjusted, confidence, reasoning = self._apply_adjustments(
            base_level=experience_level,
            keyword_level=keyword_level,
            keyword=keyword,
            years=years,
            data=data,
        )

        return SeniorityResult(
            level=adjusted,
            confidence=confidence,
            reasoning=reasoning,
            years_of_experience=round(years, 1),
            keyword_detected=keyword,
        )

    # ── Sinal primário: experiência em anos ──────────────────────────────────

    @staticmethod
    def _level_from_experience(years: float) -> SeniorityLevel:
        for min_years, level in _EXPERIENCE_RULES:
            if years >= min_years:
                return level
        return SeniorityLevel.INTERN

    # ── Sinal secundário: palavras-chave nos cargos ──────────────────────────

    @staticmethod
    def _level_from_keywords(roles_text: str) -> tuple[Optional[SeniorityLevel], Optional[str]]:
        text = roles_text.lower()
        for level_name, keywords in _ROLE_KEYWORDS.items():
            for kw in keywords:
                if kw in text:
                    level_map = {
                        "director": SeniorityLevel.DIRECTOR,
                        "principal": SeniorityLevel.PRINCIPAL,
                        "lead": SeniorityLevel.LEAD,
                        "senior": SeniorityLevel.SENIOR,
                        "mid": SeniorityLevel.MID,
                        "junior": SeniorityLevel.JUNIOR,
                        "intern": SeniorityLevel.INTERN,
                    }
                    return level_map.get(level_name), kw
        return None, None

    # ── Ajustes e composição final ───────────────────────────────────────────

    @staticmethod
    def _rank(level: SeniorityLevel) -> int:
        return _LEVEL_ORDER.index(level)

    def _adjust(self, level: SeniorityLevel, delta: int) -> SeniorityLevel:
        idx = max(0, min(len(_LEVEL_ORDER) - 1, self._rank(level) + delta))
        return _LEVEL_ORDER[idx]

    def _apply_adjustments(
        self,
        base_level: SeniorityLevel,
        keyword_level: Optional[SeniorityLevel],
        keyword: Optional[str],
        years: float,
        data: SeniorityInput,
    ) -> tuple[SeniorityLevel, str, str]:

        level = base_level
        confidence = "high"
        reasons: list[str] = [
            f"Experiência base: {years:.1f} anos → {base_level.value}"
        ]

        # Palavras-chave de cargo: podem elevar o nível (nunca rebaixar)
        if keyword_level and self._rank(keyword_level) > self._rank(level):
            level = keyword_level
            confidence = "medium"  # a palavra-chave pode ser aspiracional
            reasons.append(f"Palavra-chave '{keyword}' sugere nível {keyword_level.value}")

        # Gestão confirmada: director/lead requerem gestão — rebaixa se ausente
        if level == SeniorityLevel.DIRECTOR and not data.has_management_experience:
            level = SeniorityLevel.PRINCIPAL
            confidence = "medium"
            reasons.append("Director sem evidência de gestão → rebaixado para Principal")

        if level == SeniorityLevel.LEAD and not (
            data.has_management_experience or data.has_project_leadership
        ):
            level = SeniorityLevel.SENIOR
            confidence = "medium"
            reasons.append("Lead sem evidência de liderança → rebaixado para Senior")

        # Profundidade técnica insuficiente: proficiency média < 2.0 (básico-intermediário)
        if data.average_skill_proficiency < 2.0 and self._rank(level) >= self._rank(SeniorityLevel.SENIOR):
            level = self._adjust(level, -1)
            confidence = "low"
            reasons.append("Proficiency técnica baixa para o nível detectado")

        # Sinais conflitantes reduzem a confiança
        if keyword_level and keyword_level != base_level and keyword_level != level:
            confidence = "low"

        return level, confidence, " | ".join(reasons)
