from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncConnection

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.models.admission_model import Admission, CandidateDocument
from src.infrastructure.database.connection import engine
from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_pipeline_model import (
    CandidatePipelineModel,
    PipelineStageTransitionModel,
)
from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel


DRY_RUN = True
MAX_DELETE = 500
CHUNK_SIZE = 200


class CandidateSnapshot:
    def __init__(self, candidate_id: UUID, full_name: str, email: str | None, created_at):
        self.id = candidate_id
        self.full_name = full_name
        self.email = email
        self.created_at = created_at


def _chunked(values: list[UUID], size: int):
    for i in range(0, len(values), size):
        yield values[i:i + size]


async def _safe_delete(connection, model, column, ids):
    if not ids:
        return 0

    total = 0

    for chunk in _chunked(ids, CHUNK_SIZE):
        result = await connection.execute(
            sa.delete(model).where(column.in_(chunk))
        )
        total += int(result.rowcount or 0)

    return total


async def main():
    async with engine.begin() as connection:
        keep = (
            await connection.execute(
                sa.select(
                    CandidateModel.id,
                    CandidateModel.full_name,
                    CandidateModel.email,
                    CandidateModel.created_at,
                )
                .where(CandidateModel.deleted_at.is_(None))
                .order_by(CandidateModel.created_at.desc())
                .limit(1)
            )
        ).first()

        if not keep:
            print("Nenhum candidato encontrado")
            return

        keep_candidate = CandidateSnapshot(*keep)

        candidate_ids = (
            await connection.execute(
                sa.select(CandidateModel.id)
                .where(
                    CandidateModel.deleted_at.is_(None),
                    CandidateModel.id != keep_candidate.id,
                )
                .limit(MAX_DELETE)
            )
        ).scalars().all()

        if not candidate_ids:
            print("Nada para deletar")
            return

        print(f"⚠️ Vai remover {len(candidate_ids)} candidatos")
        print(f"DRY_RUN = {DRY_RUN}")

        if DRY_RUN:
            print("Simulação finalizada. Nada foi removido.")
            return

        confirm = input("Digite DELETE para confirmar: ")
        if confirm != "DELETE":
            print("Abortado.")
            return

        resume_ids = (
            await connection.execute(
                sa.select(ResumeModel.id)
                .where(ResumeModel.candidate_id.in_(candidate_ids))
            )
        ).scalars().all()

        version_ids = (
            await connection.execute(
                sa.select(ResumeVersionModel.id)
                .where(ResumeVersionModel.resume_id.in_(resume_ids))
            )
        ).scalars().all()

        analysis_ids = (
            await connection.execute(
                sa.select(AnalysisModel.id)
                .where(AnalysisModel.resume_version_id.in_(version_ids))
            )
        ).scalars().all()

        removed = {}

        removed["analysis_results"] = await _safe_delete(
            connection, AnalysisResultModel, AnalysisResultModel.analysis_id, analysis_ids
        )

        removed["resume_job_matches"] = await _safe_delete(
            connection, ResumeJobMatchModel, ResumeJobMatchModel.analysis_id, analysis_ids
        )

        removed["analyses"] = await _safe_delete(
            connection, AnalysisModel, AnalysisModel.id, analysis_ids
        )

        removed["resume_versions"] = await _safe_delete(
            connection, ResumeVersionModel, ResumeVersionModel.id, version_ids
        )

        removed["resumes"] = await _safe_delete(
            connection, ResumeModel, ResumeModel.id, resume_ids
        )

        removed["candidate_pipeline"] = await _safe_delete(
            connection, CandidatePipelineModel, CandidatePipelineModel.candidate_id, candidate_ids
        )

        removed["pipeline_stage_transitions"] = await _safe_delete(
            connection, PipelineStageTransitionModel, PipelineStageTransitionModel.candidate_id, candidate_ids
        )

        removed["candidate_job_scores"] = await _safe_delete(
            connection, CandidateJobScoreModel, CandidateJobScoreModel.candidate_id, candidate_ids
        )

        removed["candidates"] = await _safe_delete(
            connection, CandidateModel, CandidateModel.id, candidate_ids
        )

    await engine.dispose()

    print(f"Candidato mantido: {keep_candidate.full_name}")
    print(f"Total removido: {sum(removed.values())}")

    for k, v in removed.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    asyncio.run(main())