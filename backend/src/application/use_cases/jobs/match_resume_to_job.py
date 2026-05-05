"""Thin adapter over the primary matching flow."""

import structlog

from src.application.dtos.analysis_dtos import MatchResumeToJobCommand, MatchResumeToJobResult
from src.application.services.analysis_service import AnalysisService
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository

logger = structlog.get_logger(__name__)


class MatchResumeToJobUseCase:
    def __init__(
        self,
        analysis_repo: SQLAlchemyAnalysisRepository,
        job_repo: SQLAlchemyJobRepository,
    ) -> None:
        self._analysis_repo = analysis_repo
        self._job_repo = job_repo

    async def execute(self, command: MatchResumeToJobCommand) -> MatchResumeToJobResult:
        response = await AnalysisService(self._analysis_repo).match_completed_analysis_to_job(
            command.analysis_id,
            command.job_id,
        )
        persisted = await self._analysis_repo.find_candidate_job_match_for_analysis(
            command.analysis_id,
            command.job_id,
        )
        if persisted is None:
            raise RuntimeError("Match persistido não encontrado após execução do motor principal")

        logger.info(
            "analysis.job_match_created_via_primary_engine",
            match_id=str(persisted.id),
            analysis_id=str(command.analysis_id),
            job_id=str(command.job_id),
            score=float(response.match_score),
            recommendation=response.recommendation,
            engine_used=response.engine_used,
        )

        return MatchResumeToJobResult(
            match_id=persisted.id,
            analysis_id=command.analysis_id,
            job_id=command.job_id,
            match_score=response.match_score,
            recommendation=response.recommendation,
            matched_skills=list(persisted.matched_skills_json or []),
            missing_mandatory_skills=list(persisted.missing_skills_json or []),
            missing_optional_skills=[],
            bonus_skills=[],
            match_summary=persisted.explanation or "",
            score_breakdown=dict(response.score_breakdown or {}),
            engine_used=response.engine_used,
        )
