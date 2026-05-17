"""
CandidateProfile — Value object gerado pelo ResumeProfilerService.

Representa a compreensão semântica de um currículo, com foco em EVIDÊNCIAS
extraídas, não em avaliações de compatibilidade.

Não depende de banco de dados. É gerado sob demanda e cacheado por hash.
"""

from dataclasses import dataclass, field
from typing import Optional

# Valid confidence levels
VALID_CONFIDENCE: frozenset[str] = frozenset({"very_high", "high", "medium", "low"})

# Valid strength levels
VALID_STRENGTHS: frozenset[str] = frozenset({"very_high", "high", "medium", "low"})

# Valid evidence sources
VALID_SOURCES: frozenset[str] = frozenset(
    {"experience", "project", "education", "certification", "summary", "skill_mention"}
)


# ---------------------------------------------------------------------------
# Sub-structures
# ---------------------------------------------------------------------------


@dataclass
class Experience:
    """Uma experiência profissional com datas e contexto."""

    company: str
    role: str
    duration_months: Optional[int] = None
    is_current: bool = False
    is_leadership: bool = False
    key_activities: list[str] = field(default_factory=list)
    technologies_used: list[str] = field(default_factory=list)


@dataclass
class EvidencedSkill:
    """Uma skill que foi comprovada por evidência real, não apenas mencionada."""

    name: str
    evidence_text: str
    confidence: str  # very_high | high | medium | low
    years_evidenced: Optional[float] = None
    source: str = "experience"  # experience | project | education | certification | summary


@dataclass
class CandidateCapability:
    """Uma capacidade comportamental ou transversal demonstrada pelo candidato."""

    name: str
    evidence_text: str
    strength: str  # very_high | high | medium | low
    source: str  # experience | project | education | certification | summary
    confidence: str  # very_high | high | medium | low


@dataclass
class EducationEntry:
    """Uma entrada de educação formal."""

    level: str  # none | high_school | technical | bachelor | postgraduate | master | phd
    field: Optional[str] = None
    institution: Optional[str] = None
    graduation_year: Optional[int] = None
    is_completed: bool = False


@dataclass
class CertificationEntry:
    """Uma certificação profissional."""

    name: str
    issuer: Optional[str] = None
    obtained_date: Optional[str] = None
    is_active: bool = True


# ---------------------------------------------------------------------------
# Main CandidateProfile
# ---------------------------------------------------------------------------


@dataclass
class CandidateProfile:
    """
    Perfil semântico de um candidato, gerado pelo ResumeProfilerService.

    Foco em EVIDÊNCIAS — o que pode ser comprovado ou razoavelmente inferido
    do currículo, não em avaliações de compatibilidade com uma vaga específica.

    Campos-chave:
      detected_level           — Nível de senioridade inferido do currículo
      estimated_experience_years — Anos totais de experiência
      current_role             — Função atual ou mais recente
      professional_area        — Área principal: tech, data, admin, accounting, financial, etc.
      experiences              — Lista de experiências profissionais com contexto
      evidenced_skills         — Skills comprovadas por experiência, não apenas citadas
      tools_and_systems        — Ferramentas, linguagens, plataformas mencionadas
      capabilities             — Capacidades comportamentais (liderança, comunicação, etc.)
      education                — Formação formal
      certifications           — Certificações profissionais
      leadership_evidence      — Evidências de liderança (gestão, projetos, mentoria)
      business_impact_evidence — Impacto nos negócios (resultados, crescimento)
      profile_completeness     — 0-1: quão completo/detalhado está o currículo
      confidence               — very_high | high | medium | low
      resume_hash              — Hash do texto original (chave de cache)
    """

    detected_level: str  # intern | junior | mid | senior | lead | principal | undefined
    estimated_experience_years: float
    current_role: Optional[str]
    professional_area: str  # technology | data | administrative | accounting | financial | commercial | operational | other
    experiences: list[Experience]
    evidenced_skills: list[EvidencedSkill]
    tools_and_systems: list[str]
    capabilities: list[CandidateCapability]
    education: list[EducationEntry]
    certifications: list[CertificationEntry]
    leadership_evidence: list[str]  # Evidências textuais de liderança
    business_impact_evidence: list[str]  # Evidências de impacto
    profile_completeness: float  # 0-1
    confidence: str  # very_high | high | medium | low
    resume_hash: str  # SHA-256 parcial

    def __post_init__(self) -> None:
        if self.confidence not in VALID_CONFIDENCE:
            self.confidence = "low"
        self.profile_completeness = max(0.0, min(1.0, float(self.profile_completeness)))
        if not self.professional_area:
            self.professional_area = "other"

    @property
    def is_well_described(self) -> bool:
        return self.profile_completeness >= 0.60

    @property
    def total_skills_evidenced(self) -> int:
        return len(self.evidenced_skills)

    @property
    def total_experiences(self) -> int:
        return len(self.experiences)

    @property
    def has_leadership(self) -> bool:
        return bool(self.leadership_evidence)

    def to_dict(self) -> dict:
        return {
            "detected_level": self.detected_level,
            "estimated_experience_years": self.estimated_experience_years,
            "current_role": self.current_role,
            "professional_area": self.professional_area,
            "experiences": [
                {
                    "company": e.company,
                    "role": e.role,
                    "duration_months": e.duration_months,
                    "is_current": e.is_current,
                    "is_leadership": e.is_leadership,
                    "key_activities": e.key_activities,
                    "technologies_used": e.technologies_used,
                }
                for e in self.experiences
            ],
            "evidenced_skills": [
                {
                    "name": s.name,
                    "evidence_text": s.evidence_text,
                    "confidence": s.confidence,
                    "years_evidenced": s.years_evidenced,
                    "source": s.source,
                }
                for s in self.evidenced_skills
            ],
            "tools_and_systems": list(self.tools_and_systems),
            "capabilities": [
                {
                    "name": c.name,
                    "evidence_text": c.evidence_text,
                    "strength": c.strength,
                    "source": c.source,
                    "confidence": c.confidence,
                }
                for c in self.capabilities
            ],
            "education": [
                {
                    "level": e.level,
                    "field": e.field,
                    "institution": e.institution,
                    "graduation_year": e.graduation_year,
                    "is_completed": e.is_completed,
                }
                for e in self.education
            ],
            "certifications": [
                {
                    "name": c.name,
                    "issuer": c.issuer,
                    "obtained_date": c.obtained_date,
                    "is_active": c.is_active,
                }
                for c in self.certifications
            ],
            "leadership_evidence": list(self.leadership_evidence),
            "business_impact_evidence": list(self.business_impact_evidence),
            "profile_completeness": self.profile_completeness,
            "confidence": self.confidence,
            "resume_hash": self.resume_hash,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "CandidateProfile":
        return cls(
            detected_level=data.get("detected_level", "undefined"),
            estimated_experience_years=float(data.get("estimated_experience_years", 0)),
            current_role=data.get("current_role"),
            professional_area=data.get("professional_area", "other"),
            experiences=[
                Experience(**e) for e in (data.get("experiences") or [])
            ],
            evidenced_skills=[
                EvidencedSkill(**s) for s in (data.get("evidenced_skills") or [])
            ],
            tools_and_systems=data.get("tools_and_systems") or [],
            capabilities=[
                CandidateCapability(**c) for c in (data.get("capabilities") or [])
            ],
            education=[
                EducationEntry(**e) for e in (data.get("education") or [])
            ],
            certifications=[
                CertificationEntry(**c) for c in (data.get("certifications") or [])
            ],
            leadership_evidence=data.get("leadership_evidence") or [],
            business_impact_evidence=data.get("business_impact_evidence") or [],
            profile_completeness=float(data.get("profile_completeness", 0.5)),
            confidence=data.get("confidence", "medium"),
            resume_hash=data.get("resume_hash", ""),
        )
