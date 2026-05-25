from __future__ import annotations

POST_HIRING_ACTIVE_STAGES: frozenset[str] = frozenset(
    {"hired", "pre_admission", "protheus"}
)

SUCCESS_TERMINAL_STAGES: frozenset[str] = frozenset({"admitted"})

OPERATIONALLY_CLOSED_RELATIONSHIP_STATUSES: frozenset[str] = frozenset(
    {"rejected", "withdrawn", "archived"}
)

OPERATIONALLY_CLOSED_STAGES: frozenset[str] = frozenset({"rejected"})


def is_post_hiring_active_stage(stage: str | None) -> bool:
    return stage in POST_HIRING_ACTIVE_STAGES


def is_success_terminal_stage(stage: str | None) -> bool:
    return stage in SUCCESS_TERMINAL_STAGES


def is_operationally_closed_process(
    *,
    relationship_status: str | None,
    stage: str | None,
) -> bool:
    return (
        relationship_status in OPERATIONALLY_CLOSED_RELATIONSHIP_STATUSES
        or stage in OPERATIONALLY_CLOSED_STAGES
    )
