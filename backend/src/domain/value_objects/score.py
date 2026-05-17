from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

_TWO_PLACES = Decimal("0.01")
_ZERO = Decimal("0")
_HUNDRED = Decimal("100")


@dataclass(frozen=True)
class Score:
    """
    Valor entre 0.00 e 100.00 representando um score de análise.
    Imutável por design — scores nunca são alterados, apenas re-calculados.
    Toda aritmética interna usa Decimal; float só é exposto em __float__ para
    compatibilidade com serialização externa.
    """

    value: Decimal

    def __post_init__(self) -> None:
        if not isinstance(self.value, Decimal):
            raise TypeError("Score.value must be Decimal")
        if not (_ZERO <= self.value <= _HUNDRED):
            raise ValueError(f"Score must be between 0 and 100, got {self.value}")

    @classmethod
    def zero(cls) -> "Score":
        return cls(_ZERO)

    @classmethod
    def perfect(cls) -> "Score":
        return cls(_HUNDRED)

    @classmethod
    def of(cls, value: "Decimal | int | float | str") -> "Score":
        """Factory — converte para Decimal e clamp em [0, 100] sem aritmética float."""
        d = value if isinstance(value, Decimal) else Decimal(str(value))
        clamped = max(_ZERO, min(_HUNDRED, d))
        return cls(clamped.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP))

    def weighted(self, weight: Decimal) -> Decimal:
        """Retorna valor ponderado como Decimal (para somar, não é um Score isolado)."""
        return self.value * weight

    def __add__(self, other: "Score") -> "Score":
        raw = self.value + other.value
        clamped = min(raw, _HUNDRED)
        return Score(clamped.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP))

    def __float__(self) -> float:
        return float(self.value)

    def __repr__(self) -> str:
        return f"Score({self.value})"

    @property
    def label(self) -> str:
        if self.value >= Decimal("90"):
            return "Excepcional"
        if self.value >= Decimal("75"):
            return "Forte"
        if self.value >= Decimal("60"):
            return "Bom"
        if self.value >= Decimal("45"):
            return "Regular"
        if self.value >= Decimal("30"):
            return "Fraco"
        return "Insuficiente"


@dataclass(frozen=True)
class ScoreBreakdown:
    """
    Resultado completo de uma análise de score.
    Cada dimensão é calculada independentemente e depois combinada.
    """

    overall: Score
    technical: Score
    experience: Score
    education: Score
    communication: Score
    leadership: Score
    details: dict  # breakdown transparente para auditoria e exibição

    # Pesos usados na composição do overall_score (somente para auditoria)
    WEIGHTS: dict = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        object.__setattr__(self, "WEIGHTS", {
            "technical": 0.35,
            "experience": 0.30,
            "education": 0.15,
            "communication": 0.10,
            "leadership": 0.10,
        })

    def to_dict(self) -> dict:
        return {
            "overall_score": float(self.overall.value),
            "technical_score": float(self.technical.value),
            "experience_score": float(self.experience.value),
            "education_score": float(self.education.value),
            "communication_score": float(self.communication.value),
            "leadership_score": float(self.leadership.value),
            "overall_label": self.overall.label,
            "details": self.details,
        }
