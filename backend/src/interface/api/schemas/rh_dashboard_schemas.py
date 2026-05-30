from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RhDashboardSummary(BaseModel):
    new_candidates: int = 0
    interviews_today: int = 0
    pending_decisions: int = 0
    pending_pre_admissions: int = 0
    admitted_this_month: int = 0


class RhDashboardPendingAction(BaseModel):
    type: str
    candidate_id: UUID
    candidate_name: str
    job_id: UUID | None = None
    job_title: str | None = None
    label: str
    action_label: str
    href: str

    model_config = ConfigDict(from_attributes=True)


class RhDashboardResponse(BaseModel):
    summary: RhDashboardSummary
    pending_actions: list[RhDashboardPendingAction]
