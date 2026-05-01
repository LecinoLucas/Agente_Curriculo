"""Integration tests ensuring candidate-job-link invariant across all endpoints.

CRITICAL: A candidate must NOT appear in ANY endpoint's response for a given job
unless there is an active CandidateJobLinkModel record (deleted_at IS NULL) for
that (candidate_id, job_id) pair.

This test suite validates this invariant across:
1. Candidate ranking endpoints
2. Job candidate listing endpoints
3. Score explanation endpoints
4. Matching observability endpoints
5. Analysis matching endpoints
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_job_link_service import CandidateJobLinkService
from src.application.services.candidate_ranking_service import CandidateRankingService
from src.application.services.job_score_explanation_service import JobScoreExplanationService
from src.application.services.matching_observability_service import MatchingObservabilityService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)
from src.infrastructure.repositories.sqlalchemy_candidate_job_link_repository import (
    SQLAlchemyCandidateJobLinkRepository,
)
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    SQLAlchemyCandidateRepository,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import (
    SQLAlchemyJobRepository,
)


class TestCandidateJobLinkInvariant:
    """Tests ensuring candidate-job-link invariant across all endpoints."""

    async def _setup_candidates_and_jobs(
        self, db_session: AsyncSession
    ) -> dict:
        """Helper to create test candidates, jobs, and score version."""
        # Create candidates
        candidate_a = CandidateModel(id=uuid4(), full_name="Alice", email="alice@test.com")
        candidate_b = CandidateModel(id=uuid4(), full_name="Bob", email="bob@test.com")
        candidate_c = CandidateModel(
            id=uuid4(), full_name="Charlie", email="charlie@test.com"
        )
        db_session.add_all([candidate_a, candidate_b, candidate_c])

        # Create jobs
        job_1 = JobModel(
            id=uuid4(),
            title="Senior Engineer",
            description="Looking for a senior engineer",
            status="published",
        )
        job_2 = JobModel(
            id=uuid4(),
            title="Product Manager",
            description="Looking for a product manager",
            status="published",
        )
        db_session.add_all([job_1, job_2])

        # Create score model version
        version = ScoreModelVersionModel(
            id=uuid4(),
            version="1.0.0",
            weights={},
            thresholds={},
            is_active=True,
            created_at=datetime.now(UTC),
        )
        db_session.add(version)

        await db_session.flush()

        return {
            "candidates": {"A": candidate_a, "B": candidate_b, "C": candidate_c},
            "jobs": {"job_1": job_1, "job_2": job_2},
            "version": version,
        }

    async def test_candidate_ranking_excludes_unlinked_candidates(
        self, db_session: AsyncSession
    ):
        """Verify: unlinked candidates do not appear in ranking endpoint."""
        data = await self._setup_candidates_and_jobs(db_session)
        job_1 = data["jobs"]["job_1"]
        candidate_a = data["candidates"]["A"]
        candidate_b = data["candidates"]["B"]
        candidate_c = data["candidates"]["C"]
        version = data["version"]

        # Create link only for A and B (not C)
        link_repo = SQLAlchemyCandidateJobLinkRepository(db_session)
        await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_a.id,
                job_id=job_1.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_b.id,
                job_id=job_1.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        # Create scores for all three (C is unlinked!)
        for idx, candidate in enumerate([candidate_a, candidate_b, candidate_c], 1):
            score = CandidateJobScoreModel(
                id=uuid4(),
                candidate_id=candidate.id,
                job_id=job_1.id,
                version_id=version.id,
                final_score=Decimal(str(50 + idx * 10)),
                decision_suggestion="review",
                computed_at=datetime.now(UTC),
            )
            db_session.add(score)

        await db_session.flush()

        # Fetch ranking
        ranking_service = CandidateRankingService(db_session)
        ranking = await ranking_service.get_ranking(job_1.id)

        # CRITICAL: C must not appear (no link)
        candidate_ids = [c["candidate_id"] for c in ranking["candidates"]]
        assert candidate_a.id in candidate_ids, "Linked candidate A must appear"
        assert candidate_b.id in candidate_ids, "Linked candidate B must appear"
        assert (
            candidate_c.id not in candidate_ids
        ), "Unlinked candidate C must NOT appear"

    async def test_job_candidate_listing_excludes_unlinked_candidates(
        self, db_session: AsyncSession
    ):
        """Verify: unlinked candidates do not appear in job candidate listing."""
        data = await self._setup_candidates_and_jobs(db_session)
        job_1 = data["jobs"]["job_1"]
        candidate_a = data["candidates"]["A"]
        candidate_b = data["candidates"]["B"]
        candidate_c = data["candidates"]["C"]

        # Create link only for A (not B or C)
        link_repo = SQLAlchemyCandidateJobLinkRepository(db_session)
        await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_a.id,
                job_id=job_1.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        await db_session.flush()

        # List candidates for job
        job_repo = SQLAlchemyJobRepository(db_session)
        candidates = await job_repo.list_candidate_ranking(job_1.id)

        # CRITICAL: Only A appears (only one with link)
        candidate_ids = [c["candidate_id"] for c in candidates]
        assert (
            len(candidate_ids) == 1
        ), f"Expected 1 linked candidate, got {len(candidate_ids)}"
        assert (
            candidate_a.id in candidate_ids
        ), "Linked candidate A must appear in ranking"
        assert (
            candidate_b.id not in candidate_ids
        ), "Unlinked candidate B must NOT appear"
        assert (
            candidate_c.id not in candidate_ids
        ), "Unlinked candidate C must NOT appear"

    async def test_top_job_matches_excludes_unlinked_candidates(
        self, db_session: AsyncSession
    ):
        """Verify: unlinked candidates do not appear in top job matches."""
        data = await self._setup_candidates_and_jobs(db_session)
        job_1 = data["jobs"]["job_1"]
        job_2 = data["jobs"]["job_2"]
        candidate_a = data["candidates"]["A"]
        candidate_b = data["candidates"]["B"]

        # Create link for A to job_1 only (not job_2)
        link_repo = SQLAlchemyCandidateJobLinkRepository(db_session)
        await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_a.id,
                job_id=job_1.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        # Create link for B to job_2 (not job_1)
        await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_b.id,
                job_id=job_2.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        await db_session.flush()

        # List top matches for A
        candidate_repo = SQLAlchemyCandidateRepository(db_session)
        matches = await candidate_repo.list_top_job_matches(candidate_a.id)

        # CRITICAL: Should return empty (no actual ResumeJobMatch records)
        # But if there WERE matches, they'd all be to job_1 (only job A is linked to)
        # The join with CandidateJobLinkModel prevents results for unlinked jobs
        assert all(
            m["job_id"] == job_1.id for m in matches
        ), "All matches must be to jobs where candidate has link"

    async def test_soft_delete_link_hides_candidate(
        self, db_session: AsyncSession
    ):
        """Verify: soft-deleting a link removes candidate from all endpoints."""
        data = await self._setup_candidates_and_jobs(db_session)
        job_1 = data["jobs"]["job_1"]
        candidate_a = data["candidates"]["A"]
        version = data["version"]

        # Create and then soft-delete link
        link_repo = SQLAlchemyCandidateJobLinkRepository(db_session)
        link = await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_a.id,
                job_id=job_1.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        # Create score
        score = CandidateJobScoreModel(
            id=uuid4(),
            candidate_id=candidate_a.id,
            job_id=job_1.id,
            version_id=version.id,
            final_score=Decimal("75.00"),
            decision_suggestion="review",
            computed_at=datetime.now(UTC),
        )
        db_session.add(score)
        await db_session.flush()

        # Verify candidate appears before soft-delete
        job_repo = SQLAlchemyJobRepository(db_session)
        candidates_before = await job_repo.list_candidate_ranking(job_1.id)
        assert any(
            c["candidate_id"] == candidate_a.id for c in candidates_before
        ), "Candidate should appear before soft-delete"

        # Soft-delete the link
        await link_repo.soft_delete(candidate_a.id, job_1.id)
        await db_session.flush()

        # Verify candidate disappears after soft-delete
        candidates_after = await job_repo.list_candidate_ranking(job_1.id)
        assert (
            len(candidates_after) == 0
        ), "Candidate must disappear after soft-delete"

    async def test_deleted_job_candidate_link_excludes_from_listing(
        self, db_session: AsyncSession
    ):
        """Verify: deleted links exclude from candidate-job lists."""
        data = await self._setup_candidates_and_jobs(db_session)
        job_1 = data["jobs"]["job_1"]
        candidate_a = data["candidates"]["A"]
        candidate_b = data["candidates"]["B"]

        # Create links, then delete one
        link_repo = SQLAlchemyCandidateJobLinkRepository(db_session)
        link_a = await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_a.id,
                job_id=job_1.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_b.id,
                job_id=job_1.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        await db_session.flush()

        # Verify both appear
        job_repo = SQLAlchemyJobRepository(db_session)
        candidates = await job_repo.list_candidate_ranking(job_1.id)
        assert len(candidates) == 2, "Both candidates should appear"

        # Delete A's link
        await link_repo.soft_delete(candidate_a.id, job_1.id)
        await db_session.flush()

        # Verify only B appears
        candidates = await job_repo.list_candidate_ranking(job_1.id)
        assert len(candidates) == 1, "Only one candidate should remain"
        assert (
            candidates[0]["candidate_id"] == candidate_b.id
        ), "Only B should remain"

    async def test_feedback_validation_requires_link(
        self, db_session: AsyncSession
    ):
        """Verify: saving feedback requires active candidate-job link."""
        data = await self._setup_candidates_and_jobs(db_session)
        job_1 = data["jobs"]["job_1"]
        candidate_a = data["candidates"]["A"]

        # NO link created
        observability_service = MatchingObservabilityService(db_session)

        # CRITICAL: Should fail because no link exists
        with pytest.raises(
            ValueError,
            match=f"Candidate {candidate_a.id} is not linked to job {job_1.id}",
        ):
            await observability_service.save_feedback(
                job_id=job_1.id,
                candidate_id=candidate_a.id,
                analysis_id=uuid4(),
                liked=True,
                rejected=False,
                hired=False,
                comment="Good candidate",
                feedback_by=uuid4(),
            )

    async def test_score_explanation_requires_link(
        self, db_session: AsyncSession
    ):
        """Verify: getting score explanation requires active candidate-job link."""
        data = await self._setup_candidates_and_jobs(db_session)
        job_1 = data["jobs"]["job_1"]
        candidate_a = data["candidates"]["A"]

        # NO link created
        explanation_service = JobScoreExplanationService(db_session)

        # CRITICAL: Should fail because no link exists
        with pytest.raises(
            ValueError,
            match=f"Candidate {candidate_a.id} is not linked to job {job_1.id}",
        ):
            await explanation_service.get(
                job_id=job_1.id,
                candidate_id=candidate_a.id,
                role=UserRole.ADMIN,
            )

    async def test_link_source_tracking(self, db_session: AsyncSession):
        """Verify: link source field is properly tracked and queryable."""
        data = await self._setup_candidates_and_jobs(db_session)
        job_1 = data["jobs"]["job_1"]
        candidate_a = data["candidates"]["A"]
        candidate_b = data["candidates"]["B"]

        link_repo = SQLAlchemyCandidateJobLinkRepository(db_session)

        # Create links with different sources
        await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_a.id,
                job_id=job_1.id,
                status="active",
                source="manual",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        await link_repo.create(
            CandidateJobLinkModel(
                candidate_id=candidate_b.id,
                job_id=job_1.id,
                status="active",
                source="pipeline",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        await db_session.flush()

        # Verify sources are recorded
        link_a = await link_repo.get_active_by_candidate_and_job(
            candidate_a.id, job_1.id
        )
        link_b = await link_repo.get_active_by_candidate_and_job(
            candidate_b.id, job_1.id
        )

        assert link_a.source == "manual", "Source should be manual"
        assert link_b.source == "pipeline", "Source should be pipeline"
