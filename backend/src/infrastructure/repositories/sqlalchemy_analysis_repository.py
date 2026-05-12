from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    MatchingObservationModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
)


class SQLAlchemyAnalysisRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @property
    def session(self) -> AsyncSession:
        return self._session

    async def find_resume_version_for_user(
        self,
        resume_version_id: UUID,
        current_user: User,
    ) -> ResumeVersionModel | None:
        query = (
            sa.select(ResumeVersionModel)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .where(
                ResumeVersionModel.id == resume_version_id,
                ResumeModel.deleted_at.is_(None),
                CandidateModel.deleted_at.is_(None),
            )
        )
        if not self._can_manage_all(current_user):
            query = query.where(CandidateModel.user_id == current_user.id)

        return await self._session.scalar(query)

    async def find_resume_version(self, resume_version_id: UUID) -> ResumeVersionModel | None:
        return await self._session.scalar(
            sa.select(ResumeVersionModel).where(ResumeVersionModel.id == resume_version_id)
        )

    async def find_preferred_ai_model(self) -> AIModelModel | None:
        model = await self._session.scalar(
            sa.select(AIModelModel)
            .where(AIModelModel.is_active.is_(True))
            .order_by(AIModelModel.activated_at.desc())
        )
        if model is not None:
            return model
        return await self._session.scalar(
            sa.select(AIModelModel).order_by(AIModelModel.created_at.desc())
        )

    async def find_preferred_prompt_template(
        self,
        template_type: str,
    ) -> PromptTemplateModel | None:
        from src.domain.exceptions import ValidationException

        template = await self._session.scalar(
            sa.select(PromptTemplateModel)
            .where(
                PromptTemplateModel.template_type == template_type,
                PromptTemplateModel.is_active.is_(True),
            )
            .order_by(PromptTemplateModel.activated_at.desc())
        )
        if template is not None:
            return template
        raise ValidationException(
            f"Nenhum template ativo para tipo '{template_type}'"
        )

    async def create(self, analysis: AnalysisModel) -> AnalysisModel:
        self._session.add(analysis)
        await self._session.flush()
        await self._session.refresh(analysis)
        return analysis

    async def save(self, analysis: AnalysisModel) -> AnalysisModel:
        """Alias for create() for backwards compatibility."""
        return await self.create(analysis)

    async def cancel_in_progress_for_resume_version(self, resume_version_id: UUID) -> int:
        candidate_id_subquery = (
            sa.select(ResumeModel.candidate_id)
            .join(ResumeVersionModel, ResumeVersionModel.resume_id == ResumeModel.id)
            .where(ResumeVersionModel.id == resume_version_id)
            .scalar_subquery()
        )
        candidate_resume_versions = (
            sa.select(ResumeVersionModel.id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                ResumeModel.candidate_id == candidate_id_subquery,
                ResumeModel.deleted_at.is_(None),
            )
        )
        now = datetime.now(UTC)
        result = await self._session.execute(
            sa.update(AnalysisModel)
            .where(
                AnalysisModel.resume_version_id.in_(candidate_resume_versions),
                sa.cast(AnalysisModel.status, sa.String).in_(["queued", "pending", "processing", "retry_scheduled"]),
            )
            .values(
                status="cancelled",
                failure_reason="Cancelled by a new analysis request for the same candidate",
                failed_at=now,
                updated_at=now,
            )
        )
        return int(result.rowcount or 0)

    async def list_for_user(
        self,
        current_user: User,
        page: int,
        page_size: int,
        status_filter: str | None,
    ) -> tuple[list[AnalysisModel], int]:
        conditions: list[sa.ColumnElement[bool]] = []
        if not self._can_manage_all(current_user):
            conditions.append(AnalysisModel.requested_by == current_user.id)
        if status_filter is not None:
            conditions.append(AnalysisModel.status == status_filter)
        else:
            conditions.append(AnalysisModel.status != "discarded")

        base_query = sa.select(AnalysisModel)
        count_query = sa.select(sa.func.count()).select_from(AnalysisModel)
        if conditions:
            base_query = base_query.where(*conditions)
            count_query = count_query.where(*conditions)

        total = int((await self._session.scalar(count_query)) or 0)
        offset = (page - 1) * page_size
        result = await self._session.execute(
            base_query.order_by(AnalysisModel.created_at.desc()).offset(offset).limit(page_size)
        )
        return list(result.scalars().all()), total

    async def find_active_for_version(
        self,
        resume_version_id: UUID,
        job_id: UUID | None,
    ) -> AnalysisModel | None:
        conditions = [
            AnalysisModel.resume_version_id == resume_version_id,
            sa.cast(AnalysisModel.status, sa.String).in_(["pending", "processing", "retry_scheduled"]),
        ]
        if job_id:
            conditions.append(AnalysisModel.job_id == job_id)
        else:
            conditions.append(AnalysisModel.job_id.is_(None))

        return await self._session.scalar(
            sa.select(AnalysisModel).where(*conditions).order_by(AnalysisModel.created_at.desc())
        )

    async def find_latest_for_version(
        self,
        resume_version_id: UUID,
        job_id: UUID,
    ) -> AnalysisModel | None:
        return await self._session.scalar(
            sa.select(AnalysisModel)
            .where(
                AnalysisModel.resume_version_id == resume_version_id,
                AnalysisModel.job_id == job_id,
            )
            .order_by(AnalysisModel.created_at.desc())
        )

    async def find_latest_completed_for_version(
        self,
        resume_version_id: UUID,
        job_id: UUID,
    ) -> AnalysisModel | None:
        return await self._session.scalar(
            sa.select(AnalysisModel)
            .where(
                AnalysisModel.resume_version_id == resume_version_id,
                AnalysisModel.job_id == job_id,
                AnalysisModel.status == "completed",
            )
            .order_by(AnalysisModel.completed_at.desc().nullslast(), AnalysisModel.created_at.desc())
        )

    async def find_for_user(self, analysis_id: UUID, current_user: User) -> AnalysisModel | None:
        query = sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        if not self._can_manage_all(current_user):
            query = query.where(AnalysisModel.requested_by == current_user.id)
        return await self._session.scalar(query)

    async def find_completed(self, analysis_id: UUID) -> AnalysisModel | None:
        return await self._session.scalar(
            sa.select(AnalysisModel).where(
                AnalysisModel.id == analysis_id,
                AnalysisModel.status == "completed",
            )
        )

    async def find_result(self, analysis_id: UUID) -> AnalysisResultModel | None:
        return await self._session.scalar(
            sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis_id)
        )

    async def list_global(
        self,
        page: int,
        page_size: int,
        status_filter: str | None = None,
        search: str | None = None,
        used_real_ai: bool | None = None,
    ) -> tuple[list[dict], int]:
        total_tokens_expr = (
            sa.func.coalesce(AnalysisResultModel.input_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.output_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_read_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_write_tokens, 0)
        )
        used_real_ai_expr = sa.case(
            (AnalysisResultModel.id.is_(None), None),
            (total_tokens_expr > 0, True),
            else_=False,
        ).label("used_real_ai")

        # Admin view — intentionally includes analyses for soft-deleted candidates/resumes.
        filters: list[sa.ColumnElement] = []
        if status_filter:
            filters.append(AnalysisModel.status == status_filter)
        else:
            filters.append(AnalysisModel.status != "discarded")
        if search:
            term = f"%{search.lower().strip()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(CandidateModel.full_name).like(term),
                    sa.func.lower(CandidateModel.email).like(term),
                )
            )
        if used_real_ai is True:
            filters.append(
                sa.and_(AnalysisResultModel.id.is_not(None), total_tokens_expr > 0)
            )
        elif used_real_ai is False:
            filters.append(
                sa.and_(AnalysisResultModel.id.is_not(None), total_tokens_expr == 0)
            )

        joins = (
            sa.select(sa.func.count())
            .select_from(AnalysisModel)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .outerjoin(AnalysisResultModel, AnalysisResultModel.analysis_id == AnalysisModel.id)
        )
        total = int((await self._session.scalar(joins.where(*filters))) or 0)

        offset = (page - 1) * page_size
        result = await self._session.execute(
            sa.select(
                AnalysisModel.id,
                AnalysisModel.job_id,
                AnalysisModel.resume_version_id,
                AnalysisModel.status,
                AnalysisModel.failure_reason,
                AnalysisModel.discarded_at,
                AnalysisModel.discarded_by,
                AnalysisModel.discard_reason,
                AnalysisModel.discard_reason_note,
                AnalysisModel.retry_count,
                AnalysisModel.created_at,
                AnalysisModel.started_at,
                AnalysisModel.completed_at,
                AnalysisModel.failed_at,
                CandidateModel.id.label("candidate_id"),
                CandidateModel.full_name.label("candidate_name"),
                CandidateModel.email.label("candidate_email"),
                ResumeVersionModel.original_file_name.label("resume_file_name"),
                used_real_ai_expr,
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .outerjoin(AnalysisResultModel, AnalysisResultModel.analysis_id == AnalysisModel.id)
            .where(*filters)
            .order_by(AnalysisModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return [dict(row) for row in result.mappings().all()], total

    async def find_active_job(self, job_id: UUID) -> JobModel | None:
        return await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
                JobModel.status != "archived",
            )
        )

    async def is_decision_linked(self, analysis_id: UUID) -> bool:
        linked_score = await self._session.scalar(
            sa.select(sa.literal(True))
            .select_from(CandidateJobScoreModel)
            .where(CandidateJobScoreModel.source_analysis_id == analysis_id)
            .limit(1)
        )
        if linked_score:
            return True

        linked_snapshot = await self._session.scalar(
            sa.select(sa.literal(True))
            .select_from(CandidateJobScoreSnapshotModel)
            .where(CandidateJobScoreSnapshotModel.source_analysis_id == analysis_id)
            .limit(1)
        )
        if linked_snapshot:
            return True

        linked_observation = await self._session.scalar(
            sa.select(sa.literal(True))
            .select_from(MatchingObservationModel)
            .where(
                MatchingObservationModel.analysis_id == analysis_id,
                sa.or_(
                    MatchingObservationModel.hired.is_(True),
                    MatchingObservationModel.rejected.is_(True),
                    MatchingObservationModel.liked.is_(True),
                    MatchingObservationModel.feedback_comment.is_not(None),
                ),
            )
            .limit(1)
        )
        return bool(linked_observation)

    async def list_active_job_skill_rows(self, job_id: UUID):
        result = await self._session.execute(
            sa.select(
                JobRequiredSkillModel,
                SkillModel.name.label("skill_name"),
            )
            .join(SkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
            .where(JobRequiredSkillModel.job_id == job_id, SkillModel.deleted_at.is_(None))
        )
        return result.all()

    async def find_active_score_model_version(self) -> ScoreModelVersionModel | None:
        return await self._session.scalar(
            sa.select(ScoreModelVersionModel)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .order_by(ScoreModelVersionModel.created_at.desc())
        )

    async def list_unmatched_published_jobs(
        self,
        analysis_id: UUID,
        limit: int | None = None,
    ) -> list[JobModel]:
        analysis_context = await self._session.execute(
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                AnalysisModel.id == analysis_id,
                ResumeModel.deleted_at.is_(None),
            )
            .limit(1)
        )
        context = analysis_context.mappings().first()
        if context is None:
            return []

        candidate_id = context["candidate_id"]
        resume_version_id = context["resume_version_id"]

        query = (
            sa.select(JobModel)
            .where(
                JobModel.status == "published",
                JobModel.deleted_at.is_(None),
                ~sa.exists(
                    sa.select(1)
                    .select_from(CandidateJobMatchModel)
                    .where(
                        CandidateJobMatchModel.candidate_id == candidate_id,
                        CandidateJobMatchModel.resume_version_id == resume_version_id,
                        CandidateJobMatchModel.job_id == JobModel.id,
                    )
                ),
            )
            .order_by(JobModel.created_at.desc())
        )
        if limit is not None and limit > 0:
            query = query.limit(limit)

        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def list_published_jobs(self) -> list[JobModel]:
        result = await self._session.execute(
            sa.select(JobModel)
            .where(
                JobModel.status == "published",
                JobModel.deleted_at.is_(None),
            )
            .order_by(JobModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def count_published_jobs(self) -> int:
        return int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(JobModel)
                    .where(
                        JobModel.status == "published",
                        JobModel.deleted_at.is_(None),
                    )
                )
            )
            or 0
        )

    async def count_published_matches_for_analysis(self, analysis_id: UUID) -> int:
        context_sq = (
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                AnalysisModel.id == analysis_id,
                ResumeModel.deleted_at.is_(None),
            )
            .subquery()
        )
        return int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(CandidateJobMatchModel)
                    .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
                    .join(
                        context_sq,
                        sa.and_(
                            CandidateJobMatchModel.candidate_id == context_sq.c.candidate_id,
                            CandidateJobMatchModel.resume_version_id == context_sq.c.resume_version_id,
                        ),
                    )
                    .where(
                        JobModel.status == "published",
                        JobModel.deleted_at.is_(None),
                    )
                )
            )
            or 0
        )

    async def list_recent_job_matches_for_analysis(
        self,
        analysis_id: UUID,
        limit: int = 5,
    ) -> list[dict]:
        context_sq = (
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                AnalysisModel.id == analysis_id,
                ResumeModel.deleted_at.is_(None),
            )
            .subquery()
        )
        active_score_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )
        result = await self._session.execute(
            sa.select(
                CandidateJobMatchModel.job_id,
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                CandidateJobScoreModel.final_score.label("job_fit_score"),
                CandidateJobMatchModel.recommendation,
                CandidateJobMatchModel.created_at,
            )
            .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
            .join(
                context_sq,
                sa.and_(
                    CandidateJobMatchModel.candidate_id == context_sq.c.candidate_id,
                    CandidateJobMatchModel.resume_version_id == context_sq.c.resume_version_id,
                ),
            )
            .join(
                CandidateJobScoreModel,
                sa.and_(
                    CandidateJobScoreModel.candidate_id == CandidateJobMatchModel.candidate_id,
                    CandidateJobScoreModel.job_id == CandidateJobMatchModel.job_id,
                    CandidateJobScoreModel.version_id == active_score_version,
                    CandidateJobScoreModel.freshness_status == "fresh",
                ),
            )
            .where(
                JobModel.status == "published",
                JobModel.deleted_at.is_(None),
            )
            .order_by(
                CandidateJobScoreModel.final_score.desc().nulls_last(),
                CandidateJobMatchModel.created_at.desc(),
            )
            .limit(limit)
        )
        return [dict(row) for row in result.mappings().all()]

    async def find_candidate_job_match_for_analysis(
        self,
        analysis_id: UUID,
        job_id: UUID,
    ) -> CandidateJobMatchModel | None:
        context_sq = (
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                AnalysisModel.id == analysis_id,
                ResumeModel.deleted_at.is_(None),
            )
            .subquery()
        )
        return await self._session.scalar(
            sa.select(CandidateJobMatchModel)
            .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
            .join(
                JobProfileAnalysisModel,
                JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
            )
            .join(
                context_sq,
                sa.and_(
                    CandidateJobMatchModel.candidate_id == context_sq.c.candidate_id,
                    CandidateJobMatchModel.resume_version_id == context_sq.c.resume_version_id,
                ),
            )
            .where(
                CandidateJobMatchModel.job_id == job_id,
                CandidateJobMatchModel.freshness_status == "fresh",
                CandidateJobMatchModel.job_signature_hash == JobModel.job_profile_hash,
                JobProfileAnalysisModel.is_active.is_(True),
            )
            .order_by(
                sa.func.coalesce(
                    CandidateJobMatchModel.updated_at,
                    CandidateJobMatchModel.created_at,
                ).desc(),
                CandidateJobMatchModel.id.desc(),
            )
        )

    async def find_candidate_job_match_for_candidate_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobMatchModel | None:
        return await self._session.scalar(
            sa.select(CandidateJobMatchModel)
            .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
            .join(
                JobProfileAnalysisModel,
                JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
            )
            .where(
                CandidateJobMatchModel.candidate_id == candidate_id,
                CandidateJobMatchModel.job_id == job_id,
                CandidateJobMatchModel.freshness_status == "fresh",
                CandidateJobMatchModel.job_signature_hash == JobModel.job_profile_hash,
                JobProfileAnalysisModel.is_active.is_(True),
            )
            .order_by(
                sa.func.coalesce(
                    CandidateJobMatchModel.updated_at,
                    CandidateJobMatchModel.created_at,
                ).desc(),
                CandidateJobMatchModel.id.desc(),
            )
        )

    async def get_candidate_id_from_analysis(self, analysis_id: UUID) -> UUID | None:
        """Get candidate_id from analysis via resume_version -> resume -> candidate."""
        result = await self._session.scalar(
            sa.select(CandidateModel.id).where(
                AnalysisModel.id == analysis_id,
                ResumeVersionModel.id == AnalysisModel.resume_version_id,
                ResumeModel.id == ResumeVersionModel.resume_id,
                CandidateModel.id == ResumeModel.candidate_id,
            )
        )
        return result

    async def get_resume_version_id_from_analysis(self, analysis_id: UUID) -> UUID | None:
        return await self._session.scalar(
            sa.select(AnalysisModel.resume_version_id).where(AnalysisModel.id == analysis_id)
        )

    async def find_latest_candidate_profile_analysis(
        self,
        *,
        resume_version_id: UUID,
        provider: str,
        model_id: str,
        prompt_version: str,
    ) -> CandidateProfileAnalysisModel | None:
        return await self._session.scalar(
            sa.select(CandidateProfileAnalysisModel)
            .where(
                CandidateProfileAnalysisModel.resume_version_id == resume_version_id,
                CandidateProfileAnalysisModel.provider == provider,
                CandidateProfileAnalysisModel.model_id == model_id,
                CandidateProfileAnalysisModel.prompt_version == prompt_version,
            )
            .order_by(CandidateProfileAnalysisModel.created_at.desc())
        )

    async def find_latest_candidate_profile_analysis_for_resume(
        self,
        resume_version_id: UUID,
    ) -> CandidateProfileAnalysisModel | None:
        return await self._session.scalar(
            sa.select(CandidateProfileAnalysisModel)
            .where(CandidateProfileAnalysisModel.resume_version_id == resume_version_id)
            .order_by(CandidateProfileAnalysisModel.created_at.desc())
        )

    async def get_candidate_profile_analysis_by_version_model_prompt(
        self,
        *,
        resume_version_id: UUID,
        provider: str,
        model_id: str,
        prompt_version: str,
    ) -> CandidateProfileAnalysisModel | None:
        """Busca candidate_profile_analysis pela chave única da constraint."""
        return await self._session.scalar(
            sa.select(CandidateProfileAnalysisModel)
            .where(
                CandidateProfileAnalysisModel.resume_version_id == resume_version_id,
                CandidateProfileAnalysisModel.provider == provider,
                CandidateProfileAnalysisModel.model_id == model_id,
                CandidateProfileAnalysisModel.prompt_version == prompt_version,
            )
        )

    async def upsert_candidate_profile_analysis(
        self,
        profile: CandidateProfileAnalysisModel,
    ) -> CandidateProfileAnalysisModel:
        """UPSERT idempotente para candidate_profile_analysis.

        Garante que retry/concorrência do Celery não gere IntegrityError.

        PostgreSQL: INSERT ... ON CONFLICT DO NOTHING RETURNING *
          Se não retornar linha (já existia), faz SELECT pela chave.
        SQLite (testes): find by key → return existing or insert.

        A análise é imutável após criada — dados de tokens e resultado
        não são sobrescritos; o registro mais antigo é preservado.
        """
        if self._is_postgresql():
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            profile_id = profile.id if profile.id else uuid4()
            now = datetime.now(UTC)
            profile_created_at = profile.created_at if profile.created_at else now

            stmt = (
                pg_insert(CandidateProfileAnalysisModel)
                .values(
                    id=profile_id,
                    candidate_id=profile.candidate_id,
                    resume_version_id=profile.resume_version_id,
                    provider=profile.provider,
                    model_id=profile.model_id,
                    prompt_version=profile.prompt_version,
                    professional_area=profile.professional_area,
                    seniority_level=profile.seniority_level,
                    education_level=profile.education_level,
                    experience_years=profile.experience_years,
                    skills_json=profile.skills_json,
                    summary=profile.summary,
                    strengths_json=profile.strengths_json,
                    weaknesses_json=profile.weaknesses_json,
                    raw_response_json=profile.raw_response_json,
                    input_tokens=profile.input_tokens,
                    output_tokens=profile.output_tokens,
                    created_at=profile_created_at,
                )
                .on_conflict_do_nothing(
                    constraint="uq_candidate_profile_analysis_version_model_prompt"
                )
                .returning(CandidateProfileAnalysisModel)
            )
            result = await self._session.scalars(stmt)
            row = result.first()

            if row is not None:
                return row

            # ON CONFLICT DO NOTHING → linha já existia, buscar o existente
            existing = await self.get_candidate_profile_analysis_by_version_model_prompt(
                resume_version_id=profile.resume_version_id,
                provider=profile.provider,
                model_id=profile.model_id,
                prompt_version=profile.prompt_version,
            )
            if existing is not None:
                return existing
            # Fallback improvável: concorrência extrema; tenta inserir novamente
            self._session.add(profile)
            await self._session.flush()
            await self._session.refresh(profile)
            return profile

        # ── Fallback SQLite (testes) ────────────────────────────────────────
        existing = await self.get_candidate_profile_analysis_by_version_model_prompt(
            resume_version_id=profile.resume_version_id,
            provider=profile.provider,
            model_id=profile.model_id,
            prompt_version=profile.prompt_version,
        )
        if existing is not None:
            return existing

        self._session.add(profile)
        await self._session.flush()
        await self._session.refresh(profile)
        return profile

    async def save_candidate_profile_analysis(
        self,
        profile: CandidateProfileAnalysisModel,
    ) -> CandidateProfileAnalysisModel:
        """Alias idempotente para upsert_candidate_profile_analysis.

        Mantido para compatibilidade. Internamente usa UPSERT seguro
        contra retry/concorrência.
        """
        return await self.upsert_candidate_profile_analysis(profile)

    async def find_job_profile_analysis_by_signature(
        self,
        *,
        job_id: UUID,
        provider: str,
        model_id: str,
        prompt_version: str,
        job_signature_hash: str,
    ) -> JobProfileAnalysisModel | None:
        return await self._session.scalar(
            sa.select(JobProfileAnalysisModel)
            .where(
                JobProfileAnalysisModel.job_id == job_id,
                JobProfileAnalysisModel.provider == provider,
                JobProfileAnalysisModel.model_id == model_id,
                JobProfileAnalysisModel.prompt_version == prompt_version,
                JobProfileAnalysisModel.job_signature_hash == job_signature_hash,
                JobProfileAnalysisModel.is_active.is_(True),
            )
            .order_by(JobProfileAnalysisModel.created_at.desc())
        )

    async def find_any_job_profile_analysis_by_signature(
        self,
        *,
        job_id: UUID,
        provider: str,
        model_id: str,
        prompt_version: str,
        job_signature_hash: str,
    ) -> JobProfileAnalysisModel | None:
        return await self._session.scalar(
            sa.select(JobProfileAnalysisModel)
            .where(
                JobProfileAnalysisModel.job_id == job_id,
                JobProfileAnalysisModel.provider == provider,
                JobProfileAnalysisModel.model_id == model_id,
                JobProfileAnalysisModel.prompt_version == prompt_version,
                JobProfileAnalysisModel.job_signature_hash == job_signature_hash,
            )
            .order_by(
                JobProfileAnalysisModel.is_active.desc(),
                JobProfileAnalysisModel.created_at.desc(),
            )
        )

    async def save_job_profile_analysis(
        self,
        profile: JobProfileAnalysisModel,
    ) -> JobProfileAnalysisModel:
        if profile.is_active:
            await self._session.execute(
                sa.update(JobProfileAnalysisModel)
                .where(
                    JobProfileAnalysisModel.job_id == profile.job_id,
                    JobProfileAnalysisModel.is_active.is_(True),
                )
                .values(
                    is_active=False,
                    superseded_at=datetime.now(UTC),
                )
            )
        self._session.add(profile)
        await self._session.flush()
        await self._session.refresh(profile)
        return profile

    async def find_latest_job_profile_analysis_for_job(
        self,
        job_id: UUID,
    ) -> JobProfileAnalysisModel | None:
        return await self._session.scalar(
            sa.select(JobProfileAnalysisModel)
            .where(
                JobProfileAnalysisModel.job_id == job_id,
                JobProfileAnalysisModel.is_active.is_(True),
            )
            .order_by(JobProfileAnalysisModel.created_at.desc())
        )

    async def find_candidate_job_match(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        resume_version_id: UUID,
        candidate_profile_analysis_id: UUID,
        job_profile_analysis_id: UUID,
    ) -> CandidateJobMatchModel | None:
        return await self._session.scalar(
            sa.select(CandidateJobMatchModel).where(
                CandidateJobMatchModel.candidate_id == candidate_id,
                CandidateJobMatchModel.job_id == job_id,
                CandidateJobMatchModel.resume_version_id == resume_version_id,
                CandidateJobMatchModel.candidate_profile_analysis_id == candidate_profile_analysis_id,
                CandidateJobMatchModel.job_profile_analysis_id == job_profile_analysis_id,
            )
        )

    async def upsert_candidate_job_match(
        self,
        match: CandidateJobMatchModel,
    ) -> CandidateJobMatchModel:
        """UPSERT idempotente para matching candidato×vaga.

        Para PostgreSQL: usa ON CONFLICT DO UPDATE nativo.
        Para SQLite (testes): usa find → update/insert pattern.

        Garante que múltiplos retries/concorrência não criam duplicatas.
        """
        now = datetime.now(UTC)
        if match.freshness_status != "fresh":
            raise ValueError("candidate_job_match must be persisted with freshness_status='fresh'")
        if not match.job_signature_hash:
            raise ValueError("candidate_job_match requires non-empty job_signature_hash")

        if self._is_postgresql():
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            match_id = match.id if match.id else uuid4()
            match_created_at = match.created_at if match.created_at else now

            stmt = (
                pg_insert(CandidateJobMatchModel)
                .values(
                    id=match_id,
                    candidate_id=match.candidate_id,
                    job_id=match.job_id,
                    resume_version_id=match.resume_version_id,
                    candidate_profile_analysis_id=match.candidate_profile_analysis_id,
                    job_profile_analysis_id=match.job_profile_analysis_id,
                    candidate_job_pipeline_id=match.candidate_job_pipeline_id,
                    recommendation=match.recommendation,
                    matched_skills_json=match.matched_skills_json,
                    missing_skills_json=match.missing_skills_json,
                    explanation=match.explanation,
                    eligibility_status=match.eligibility_status,
                    score_version=match.score_version,
                    skill_evidence_breakdown=match.skill_evidence_breakdown,
                    possible_false_negative=(
                        match.possible_false_negative
                        if match.possible_false_negative is not None
                        else False
                    ),
                    created_at=match_created_at,
                    updated_at=now,
                    freshness_status=match.freshness_status,
                    job_signature_hash=match.job_signature_hash,
                )
                .on_conflict_do_update(
                    constraint="uq_candidate_job_match_profile_pair",
                    set_={
                        "recommendation": match.recommendation,
                        "matched_skills_json": match.matched_skills_json,
                        "missing_skills_json": match.missing_skills_json,
                        "explanation": match.explanation,
                        "eligibility_status": match.eligibility_status,
                        "score_version": match.score_version,
                        "skill_evidence_breakdown": match.skill_evidence_breakdown,
                        "possible_false_negative": (
                            match.possible_false_negative
                            if match.possible_false_negative is not None
                            else False
                        ),
                        "updated_at": now,
                        "freshness_status": match.freshness_status,
                        "job_signature_hash": match.job_signature_hash,
                    },
                )
                .returning(CandidateJobMatchModel)
            )
            result = await self._session.scalars(stmt)
            row = result.first()
            return row

        # Fallback para SQLite (testes): find → update/insert pattern
        existing = await self.find_candidate_job_match(
            candidate_id=match.candidate_id,
            job_id=match.job_id,
            resume_version_id=match.resume_version_id,
            candidate_profile_analysis_id=match.candidate_profile_analysis_id,
            job_profile_analysis_id=match.job_profile_analysis_id,
        )

        if existing is not None:
            existing.recommendation = match.recommendation
            existing.matched_skills_json = match.matched_skills_json
            existing.missing_skills_json = match.missing_skills_json
            existing.explanation = match.explanation
            existing.eligibility_status = match.eligibility_status
            existing.score_version = match.score_version
            existing.skill_evidence_breakdown = match.skill_evidence_breakdown
            existing.possible_false_negative = (
                match.possible_false_negative
                if match.possible_false_negative is not None
                else False
            )
            existing.updated_at = now
            existing.freshness_status = match.freshness_status
            existing.job_signature_hash = match.job_signature_hash
            await self._session.flush()
            await self._session.refresh(existing)
            return existing

        match.updated_at = now
        if match.possible_false_negative is None:
            match.possible_false_negative = False
        if not match.id:
            match.id = uuid4()
        if not match.created_at:
            match.created_at = now
        self._session.add(match)
        await self._session.flush()
        await self._session.refresh(match)
        return match

    async def count_pending(self) -> int:
        """Count pending and processing analyses in the queue."""
        result = await self._session.scalar(
            sa.select(sa.func.count()).select_from(AnalysisModel).where(
                sa.cast(AnalysisModel.status, sa.String).in_(["pending", "processing", "retry_scheduled"])
            )
        )
        return int(result or 0)

    def _is_postgresql(self) -> bool:
        """Check if the database is PostgreSQL (for UPSERT syntax)."""
        from src.core.settings import settings
        url = str(settings.DATABASE_URL)
        return url.startswith(("postgresql", "postgres"))

    @staticmethod
    def _can_manage_all(user: User) -> bool:
        return user.role.value in {"admin", "recruiter"}
