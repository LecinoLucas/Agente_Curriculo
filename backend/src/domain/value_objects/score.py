from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal


_TWO_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class Score:
    """
    Valor entre 0.00 e 100.00 representando um score de análise.
    Imutável por design — scores nunca são alterados, apenas re-calculados.
    """

    value: Decimal

    def __post_init__(self) -> None:
        if not isinstance(self.value, Decimal):
            raise TypeError("Score.value must be Decimal")
        if not (Decimal("0") <= self.value <= Decimal("100")):
            raise ValueError(f"Score must be between 0 and 100, got {self.value}")

    @classmethod
    def zero(cls) -> "Score":
        return cls(Decimal("0"))

    @classmethod
    def perfect(cls) -> "Score":
        return cls(Decimal("100"))

    @classmethod
    def of(cls, value: float | int) -> "Score":
        """Factory conveniente — converte float para Decimal com precisão de 2 casas."""
        clamped = min(max(float(value), 0.0), 100.0)
        return cls(Decimal(str(clamped)).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP))

    def weighted(self, weight: float) -> "Score":
        """Retorna o valor ponderado (não é um Score válido — use apenas internamente)."""
        return Score.of(float(self.value) * weight)

    def __add__(self, other: "Score") -> "Score":
        raw = self.value + other.value
        clamped = min(raw, Decimal("100"))
        return Score(clamped.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP))

    def __float__(self) -> float:
        return float(self.value)

    def __repr__(self) -> str:
        return f"Score({self.value})"

    @property
    def label(self) -> str:
        v = float(self.value)
        if v >= 90:
            return "Excepcional"
        if v >= 75:
            return "Forte"
        if v >= 60:
            return "Bom"
        if v >= 45:
            return "Regular"
        if v >= 30:
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
