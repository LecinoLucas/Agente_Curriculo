"""Input/output contracts for the behavioral AI engine.

Decoupled from DB models — the service layer translates ORM objects to these
structs before calling the engine.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class BehavioralQAItem:
    """A single competency/question/answer triple, already resolved to plain text."""
    competency: str
    question: str
    answer_type: str
    answer: str


@dataclass(slots=True)
class BehavioralEvaluationInput:
    """All data the engine needs to run a behavioral evaluation.

    Contains no PII, no raw resumes, no CPF/email/phone.
    The service layer is responsible for fetching and assembling this.
    """
    competency_names: list[str]
    questions_and_answers: list[BehavioralQAItem]
