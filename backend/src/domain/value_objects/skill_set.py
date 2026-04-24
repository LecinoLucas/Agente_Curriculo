from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional
from uuid import UUID

# Mapeamento numérico de proficiência para cálculos comparativos
PROFICIENCY_RANK: dict[str, int] = {
    "basic": 1,
    "intermediate": 2,
    "advanced": 3,
    "expert": 4,
}


@dataclass(frozen=True)
class SkillEntry:
    skill_id: UUID
    skill_name: str
    normalized_name: str
    proficiency_level: Optional[str] = None       # basic|intermediate|advanced|expert
    years_experience: Optional[Decimal] = None
    is_primary: bool = False                       # skill principal do candidato
    source: str = "extracted"                      # extracted|inferred

    @property
    def proficiency_rank(self) -> int:
        return PROFICIENCY_RANK.get(self.proficiency_level or "basic", 1)

    def meets_minimum_level(self, required_level: Optional[str]) -> bool:
        if required_level is None:
            return True
        return self.proficiency_rank >= PROFICIENCY_RANK.get(required_level, 1)


@dataclass(frozen=True)
class RequiredSkill:
    """Requisito de skill de uma vaga."""

    skill_id: UUID
    skill_name: str
    normalized_name: str
    is_mandatory: bool
    minimum_level: Optional[str] = None
    minimum_years: Optional[Decimal] = None
    weight: Decimal = Decimal("1.0")


@dataclass(frozen=True)
class SkillSet:
    """
    Coleção imutável de skills de um candidato.
    Usada pelos domain services para matching e scoring.
    """

    entries: frozenset[SkillEntry]

    @classmethod
    def from_list(cls, skills: list[SkillEntry]) -> "SkillSet":
        return cls(entries=frozenset(skills))

    def find(self, skill_id: UUID) -> Optional[SkillEntry]:
        return next((s for s in self.entries if s.skill_id == skill_id), None)

    def find_by_name(self, normalized_name: str) -> Optional[SkillEntry]:
        return next((s for s in self.entries if s.normalized_name == normalized_name), None)

    def has(self, skill_id: UUID) -> bool:
        return self.find(skill_id) is not None

    @property
    def primary_skills(self) -> list[SkillEntry]:
        return [s for s in self.entries if s.is_primary]

    @property
    def expert_skills(self) -> list[SkillEntry]:
        return [s for s in self.entries if s.proficiency_level == "expert"]

    @property
    def categories_covered(self) -> int:
        """Número de categorias únicas — mede amplitude do perfil técnico."""
        return len({s.normalized_name.split(".")[0] for s in self.entries})

    @property
    def average_proficiency(self) -> float:
        if not self.entries:
            return 0.0
        ranks = [s.proficiency_rank for s in self.entries]
        return sum(ranks) / len(ranks)
