from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RhDashboardSummary(BaseModel):
    new_candidates: int = 0
    interviews_today: int = 0
    pending_decisions: int = 0
    active_jobs: int = 0
    pending_pre_admissions: int = 0
    admitted_this_month: int = 0


class RhDashboardPipelineFunnelStage(BaseModel):
    id: str
    label: str
    count: int


class RhDashboardPipelineFunnelResponse(BaseModel):
    total: int
    stages: list[RhDashboardPipelineFunnelStage]


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


class RhDashboardTrendPoint(BaseModel):
    date: date
    candidates: int
    interviews: int
    hires: int


class RhDashboardTrendsResponse(BaseModel):
    days: int
    points: list[RhDashboardTrendPoint]
