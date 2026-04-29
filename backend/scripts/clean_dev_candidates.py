import asyncio
import sys
from pathlib import Path
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncConnection

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.modules.admission.models.admission_models import Admission, CandidateDocument
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


class CandidateSnapshot:
    def __init__(self, candidate_id: UUID, full_name: str, email: str | None, created_at) -> None:
        self.id = candidate_id
        self.full_name = full_name
        self.email = email
        self.created_at = created_at


def _rowcount(result: sa.CursorResult[object]) -> int:
    return int(result.rowcount or 0)


async def _fetch_ids(
    connection: AsyncConnection,
    statement: sa.Select[tuple[UUID]],
) -> list[UUID]:
    result = await connection.execute(statement)
    return list(result.scalars().all())


def _format_candidate(candidate: CandidateSnapshot) -> str:
    return (
        f"id={candidate.id} | nome={candidate.full_name} | "
        f"email={candidate.email or '-'} | created_at={candidate.created_at.isoformat()}"
    )


async def main() -> None:
    async with engine.begin() as connection:
        keep_candidate_row = (
            await connection.execute(
                sa.select(
                    CandidateModel.id,
                    CandidateModel.full_name,
                    CandidateModel.email,
                    CandidateModel.created_at,
                )
                .where(CandidateModel.deleted_at.is_(None))
                .order_by(CandidateModel.created_at.desc(), CandidateModel.id.desc())
                .limit(1)
            )
        ).first()

        if keep_candidate_row is None:
            print("Nenhum candidato ativo encontrado. Nada foi removido.")
            return

        keep_candidate = CandidateSnapshot(
            candidate_id=keep_candidate_row.id,
            full_name=keep_candidate_row.full_name,
            email=keep_candidate_row.email,
            created_at=keep_candidate_row.created_at,
        )

        candidate_ids_to_delete = await _fetch_ids(
            connection,
            sa.select(CandidateModel.id)
            .where(CandidateModel.deleted_at.is_(None), CandidateModel.id != keep_candidate.id),
        )

        if not candidate_ids_to_delete:
            print(f"Candidato mantido: {_format_candidate(keep_candidate)}")
            print("Nenhum outro candidato ativo encontrado. Nada foi removido.")
            return

        resume_ids_to_delete = await _fetch_ids(
            connection,
            sa.select(ResumeModel.id).where(ResumeModel.candidate_id.in_(candidate_ids_to_delete)),
        )

        resume_version_ids_to_delete = await _fetch_ids(
            connection,
            sa.select(ResumeVersionModel.id).where(
                ResumeVersionModel.resume_id.in_(resume_ids_to_delete)
            ),
        ) if resume_ids_to_delete else []

        analysis_ids_to_delete = await _fetch_ids(
            connection,
            sa.select(AnalysisModel.id).where(
                AnalysisModel.resume_version_id.in_(resume_version_ids_to_delete)
            ),
        ) if resume_version_ids_to_delete else []

        admission_ids_to_delete = await _fetch_ids(
            connection,
            sa.select(Admission.id).where(Admission.candidate_id.in_(candidate_ids_to_delete)),
        )

        candidate_document_ids_to_delete = await _fetch_ids(
            connection,
            sa.select(CandidateDocument.id).where(
                CandidateDocument.admission_id.in_(admission_ids_to_delete)
            ),
        ) if admission_ids_to_delete else []

        removed_counts: dict[str, int] = {}

        if analysis_ids_to_delete:
            removed_counts["analysis_results"] = _rowcount(
                await connection.execute(
                    sa.delete(AnalysisResultModel).where(
                        AnalysisResultModel.analysis_id.in_(analysis_ids_to_delete)
                    )
                )
            )

            removed_counts["resume_job_matches"] = _rowcount(
                await connection.execute(
                    sa.delete(ResumeJobMatchModel).where(
                        ResumeJobMatchModel.analysis_id.in_(analysis_ids_to_delete)
                    )
                )
            )

            removed_counts["analyses"] = _rowcount(
                await connection.execute(
                    sa.delete(AnalysisModel).where(AnalysisModel.id.in_(analysis_ids_to_delete))
                )
            )
        else:
            removed_counts["analysis_results"] = 0
            removed_counts["resume_job_matches"] = 0
            removed_counts["analyses"] = 0

        if candidate_document_ids_to_delete:
            removed_counts["document_ai_analyses"] = _rowcount(
                await connection.execute(
                    sa.delete(DocumentAIAnalysisModel).where(
                        DocumentAIAnalysisModel.document_id.in_(candidate_document_ids_to_delete)
                    )
                )
            )

            removed_counts["candidate_documents"] = _rowcount(
                await connection.execute(
                    sa.delete(CandidateDocument).where(
                        CandidateDocument.id.in_(candidate_document_ids_to_delete)
                    )
                )
            )
        else:
            removed_counts["document_ai_analyses"] = 0
            removed_counts["candidate_documents"] = 0

        if admission_ids_to_delete:
            removed_counts["admissions"] = _rowcount(
                await connection.execute(
                    sa.delete(Admission).where(Admission.id.in_(admission_ids_to_delete))
                )
            )
        else:
            removed_counts["admissions"] = 0

        removed_counts["candidate_job_scores"] = _rowcount(
            await connection.execute(
                sa.delete(CandidateJobScoreModel).where(
                    CandidateJobScoreModel.candidate_id.in_(candidate_ids_to_delete)
                )
            )
        )

        removed_counts["pipeline_stage_transitions"] = _rowcount(
            await connection.execute(
                sa.delete(PipelineStageTransitionModel).where(
                    PipelineStageTransitionModel.candidate_id.in_(candidate_ids_to_delete)
                )
            )
        )

        removed_counts["candidate_pipeline"] = _rowcount(
            await connection.execute(
                sa.delete(CandidatePipelineModel).where(
                    CandidatePipelineModel.candidate_id.in_(candidate_ids_to_delete)
                )
            )
        )

        if resume_version_ids_to_delete:
            removed_counts["resume_versions"] = _rowcount(
                await connection.execute(
                    sa.delete(ResumeVersionModel).where(
                        ResumeVersionModel.id.in_(resume_version_ids_to_delete)
                    )
                )
            )
        else:
            removed_counts["resume_versions"] = 0

        if resume_ids_to_delete:
            removed_counts["resumes"] = _rowcount(
                await connection.execute(
                    sa.delete(ResumeModel).where(ResumeModel.id.in_(resume_ids_to_delete))
                )
            )
        else:
            removed_counts["resumes"] = 0

        removed_counts["candidates"] = _rowcount(
            await connection.execute(
                sa.delete(CandidateModel).where(CandidateModel.id.in_(candidate_ids_to_delete))
            )
        )

    await engine.dispose()

    print(f"Candidato mantido: {_format_candidate(keep_candidate)}")
    total_removed = sum(removed_counts.values())
    print(f"Total de registros removidos: {total_removed}")
    for table_name, count in removed_counts.items():
        print(f"- {table_name}: {count}")


if __name__ == "__main__":
    asyncio.run(main())
