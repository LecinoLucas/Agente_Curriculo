"""
JobProfile — Value object gerado pelo JobProfiler.

Representa a compreensão semântica de uma vaga de emprego, extraída por IA a partir
do texto livre da descrição. Substitui o cadastro manual de skills por requisitos
baseados em competências e evidências.

Não depende de banco de dados. É gerado sob demanda e cacheado por hash da descrição.
"""

from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Pesos adaptativos por área profissional
# ---------------------------------------------------------------------------
# Cada dicionário deve somar 1.0.

AREA_WEIGHTS: dict[str, dict[str, float]] = {
    "technology": {
        "technical_competencies": 0.35,
        "practical_experience": 0.30,
        "role_fit": 0.15,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "data": {
        "technical_competencies": 0.30,
        "practical_experience": 0.30,
        "role_fit": 0.20,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "administrative": {
        "practical_experience": 0.35,
        "role_fit": 0.30,
        "technical_competencies": 0.15,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "accounting": {
        "practical_experience": 0.35,
        "technical_competencies": 0.25,
        "role_fit": 0.20,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "financial": {
        "practical_experience": 0.35,
        "technical_competencies": 0.25,
        "role_fit": 0.20,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "commercial": {
        "practical_experience": 0.35,
        "role_fit": 0.30,
        "technical_competencies": 0.15,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "operational": {
        "practical_experience": 0.40,
        "role_fit": 0.30,
        "technical_competencies": 0.10,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "leadership": {
        "leadership_evidence": 0.30,
        "practical_experience": 0.25,
        "role_fit": 0.20,
        "seniority_alignment": 0.15,
        "technical_competencies": 0.10,
    },
    "other": {
        "practical_experience": 0.35,
        "role_fit": 0.30,
        "technical_competencies": 0.15,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "fiscal": {
        "practical_experience": 0.35,
        "technical_competencies": 0.20,
        "role_fit": 0.25,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
    "hr": {
        "practical_experience": 0.35,
        "role_fit": 0.35,
        "technical_competencies": 0.10,
        "seniority_alignment": 0.10,
        "education": 0.10,
    },
}

# Fallback quando a área não é reconhecida.
DEFAULT_WEIGHTS: dict[str, float] = AREA_WEIGHTS["other"]

VALID_AREAS: frozenset[str] = frozenset(AREA_WEIGHTS.keys())
VALID_LEVELS: frozenset[str] = frozenset(
    {"intern", "junior", "mid", "senior", "lead", "undefined"}
)
VALID_CONFIDENCE: frozenset[str] = frozenset({"high", "medium", "low"})
VALID_REQUIREMENT_PRIORITY_LEVELS: frozenset[str] = frozenset(
    {"priority", "complementary", "eliminatory"}
)


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass
class JobRequirement:
    """Uma competência exigida pela vaga com prioridade canônica."""

    name: str
    description: str
    priority_level: str
    importance_weight: float = 1.0
    evidence_examples: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.importance_weight = float(self.importance_weight)
        if self.priority_level not in VALID_REQUIREMENT_PRIORITY_LEVELS:
            self.priority_level = "priority"


@dataclass
class JobProfile:
    """
    Perfil semântico de uma vaga, gerado pelo JobProfilerService.

    Campos-chave:
      area                  — área profissional detectada (ver AREA_WEIGHTS)
      target_level          — nível de senioridade esperado
      main_mission          — frase que resume o propósito do cargo
      critical_requirements — requisitos canônicos priority/eliminatory com peso e evidência
      desirable_requirements— requisitos canônicos complementary
      responsibilities      — lista de responsabilidades principais
      required_tools        — ferramentas, sistemas, tecnologias
      required_capabilities — capacidades comportamentais/transversais
      seniority_signals     — trechos da vaga que revelam o nível esperado
      adaptive_weights      — pesos das dimensões de scoring, ajustados por área
      job_completeness_score— 0.0-1.0: quão bem descrita está a vaga
      confidence            — confiança na extração (high/medium/low)
      description_hash      — SHA-256 parcial da descrição (chave de cache)
    """

    area: str
    target_level: str
    main_mission: str
    critical_requirements: list[JobRequirement]
    desirable_requirements: list[JobRequirement]
    responsibilities: list[str]
    required_tools: list[str]
    required_capabilities: list[str]
    seniority_signals: list[str]
    adaptive_weights: dict[str, float]
    job_completeness_score: float
    confidence: str
    description_hash: str

    def __post_init__(self) -> None:
        if self.area not in VALID_AREAS:
            self.area = "other"
        if self.target_level not in VALID_LEVELS:
            self.target_level = "undefined"
        if self.confidence not in VALID_CONFIDENCE:
            self.confidence = "low"
        self.job_completeness_score = max(0.0, min(1.0, float(self.job_completeness_score)))
        if not self.adaptive_weights:
            self.adaptive_weights = AREA_WEIGHTS.get(self.area, DEFAULT_WEIGHTS)

    @property
    def all_requirements(self) -> list[JobRequirement]:
        return self.critical_requirements + self.desirable_requirements

    @property
    def is_well_described(self) -> bool:
        return self.job_completeness_score >= 0.60

    def to_dict(self) -> dict:
        return {
            "area": self.area,
            "target_level": self.target_level,
            "main_mission": self.main_mission,
            "critical_requirements": [
                {
                    "name": r.name,
                    "description": r.description,
                    "priority_level": r.priority_level,
                    "importance_weight": r.importance_weight,
                    "evidence_examples": r.evidence_examples,
                }
                for r in self.critical_requirements
            ],
            "desirable_requirements": [
                {
                    "name": r.name,
                    "description": r.description,
                    "priority_level": r.priority_level,
                    "importance_weight": r.importance_weight,
                    "evidence_examples": r.evidence_examples,
                }
                for r in self.desirable_requirements
            ],
            "responsibilities": list(self.responsibilities),
            "required_tools": list(self.required_tools),
            "required_capabilities": list(self.required_capabilities),
            "seniority_signals": list(self.seniority_signals),
            "adaptive_weights": dict(self.adaptive_weights),
            "job_completeness_score": self.job_completeness_score,
            "confidence": self.confidence,
            "description_hash": self.description_hash,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "JobProfile":
        area = data.get("area", "other")
        def _requirement_from_dict(item: dict, default_priority_level: str) -> JobRequirement:
            payload = dict(item)
            if payload.get("priority_level") not in VALID_REQUIREMENT_PRIORITY_LEVELS:
                payload["priority_level"] = default_priority_level
            return JobRequirement(**payload)

        critical = [
            _requirement_from_dict(r, "priority")
            for r in (data.get("critical_requirements") or [])
        ]
        desirable = [
            _requirement_from_dict(r, "complementary")
            for r in (data.get("desirable_requirements") or [])
        ]
        return cls(
            area=area,
            target_level=data.get("target_level", "undefined"),
            main_mission=data.get("main_mission", ""),
            critical_requirements=critical,
            desirable_requirements=desirable,
            responsibilities=data.get("responsibilities") or [],
            required_tools=data.get("required_tools") or [],
            required_capabilities=data.get("required_capabilities") or [],
            seniority_signals=data.get("seniority_signals") or [],
            adaptive_weights=data.get("adaptive_weights") or AREA_WEIGHTS.get(area, DEFAULT_WEIGHTS),
            job_completeness_score=float(data.get("job_completeness_score", 0.5)),
            confidence=data.get("confidence", "medium"),
            description_hash=data.get("description_hash", ""),
        )
