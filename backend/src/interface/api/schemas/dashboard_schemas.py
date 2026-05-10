from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime
from uuid import UUID

class RecentAnalysis(BaseModel):
    id: UUID
    candidate_name: str
    job_title: str
    status: str
    created_at: datetime

class DashboardStatsResponse(BaseModel):
    total_candidates: int
    candidates_waiting_job: int
    open_jobs: int
    candidates_in_pipeline: int
    candidates_by_stage: Dict[str, int]
    recent_analyses: List[RecentAnalysis]
