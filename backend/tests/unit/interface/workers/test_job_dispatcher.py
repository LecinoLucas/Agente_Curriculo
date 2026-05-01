"""Tests for job dispatcher - enqueuing matching when jobs are published."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.interface.workers.job_dispatcher import enqueue_job_publication_matches


@pytest.mark.asyncio
async def test_enqueue_job_publication_matches_with_analyses():
    """Test that analyses are enqueued for matching when job is published."""
    job_id = uuid4()
    analysis_1_id = uuid4()
    analysis_2_id = uuid4()

    # Mock analyses
    mock_analyses = [
        MagicMock(id=analysis_1_id, status="completed"),
        MagicMock(id=analysis_2_id, status="completed"),
    ]

    with patch("src.core.settings.settings") as mock_settings:
        mock_settings.ENABLE_DEV_MOCK = False
        mock_settings.MATCHING_AUTO_FANOUT_LIMIT = 100

        # Mock imports that happen inside the function
        with patch(
            "src.infrastructure.database.connection.AsyncSessionFactory"
        ) as mock_session_factory_cls:
            mock_session = AsyncMock()
            mock_session_factory_cls.return_value.__aenter__.return_value = mock_session
            mock_session_factory_cls.return_value.__aexit__.return_value = None

            with patch(
                "src.infrastructure.repositories.sqlalchemy_job_repository.SQLAlchemyJobRepository"
            ) as mock_repo_class:
                mock_repo = AsyncMock()
                mock_repo_class.return_value = mock_repo
                mock_repo.list_completed_unmatched_analyses = AsyncMock(return_value=mock_analyses)

                with patch("src.interface.workers.matching_tasks.match_analysis_to_job") as mock_celery:
                    # Simulate apply_async being called
                    mock_celery.apply_async = MagicMock()

                    # Execute
                    count = await enqueue_job_publication_matches(job_id)

                    # Assertions
                    assert count == 2
                    assert mock_celery.apply_async.call_count == 2


@pytest.mark.asyncio
async def test_enqueue_job_publication_no_analyses():
    """Test that enqueuing completes gracefully when no analyses exist."""
    job_id = uuid4()

    with patch("src.core.settings.settings") as mock_settings:
        mock_settings.ENABLE_DEV_MOCK = False
        mock_settings.MATCHING_AUTO_FANOUT_LIMIT = 100

        with patch(
            "src.infrastructure.database.connection.AsyncSessionFactory"
        ) as mock_session_factory_cls:
            mock_session = AsyncMock()
            mock_session_factory_cls.return_value.__aenter__.return_value = mock_session
            mock_session_factory_cls.return_value.__aexit__.return_value = None

            with patch(
                "src.infrastructure.repositories.sqlalchemy_job_repository.SQLAlchemyJobRepository"
            ) as mock_repo_class:
                mock_repo = AsyncMock()
                mock_repo_class.return_value = mock_repo
                mock_repo.list_completed_unmatched_analyses = AsyncMock(return_value=[])

                # Execute
                count = await enqueue_job_publication_matches(job_id)

                # Assertions
                assert count == 0


@pytest.mark.asyncio
async def test_enqueue_job_publication_dev_mock():
    """Test that dev mock mode creates background tasks instead of Celery tasks."""
    job_id = uuid4()
    analysis_id = uuid4()

    mock_analyses = [
        MagicMock(id=analysis_id, status="completed"),
    ]

    with patch("src.core.settings.settings") as mock_settings:
        mock_settings.ENABLE_DEV_MOCK = True
        mock_settings.MATCHING_AUTO_FANOUT_LIMIT = 100

        with patch(
            "src.infrastructure.database.connection.AsyncSessionFactory"
        ) as mock_session_factory_cls:
            mock_session = AsyncMock()
            mock_session_factory_cls.return_value.__aenter__.return_value = mock_session
            mock_session_factory_cls.return_value.__aexit__.return_value = None

            with patch(
                "src.infrastructure.repositories.sqlalchemy_job_repository.SQLAlchemyJobRepository"
            ) as mock_repo_class:
                mock_repo = AsyncMock()
                mock_repo_class.return_value = mock_repo
                mock_repo.list_completed_unmatched_analyses = AsyncMock(return_value=mock_analyses)

                # Execute
                count = await enqueue_job_publication_matches(job_id)

                # Assertions
                assert count == 1


@pytest.mark.asyncio
async def test_enqueue_job_publication_respects_fanout_limit():
    """Test that fanout limit is respected when enqueuing."""
    job_id = uuid4()
    analyses = [MagicMock(id=uuid4()) for _ in range(10)]

    with patch("src.core.settings.settings") as mock_settings:
        mock_settings.ENABLE_DEV_MOCK = False
        mock_settings.MATCHING_AUTO_FANOUT_LIMIT = 5

        with patch(
            "src.infrastructure.database.connection.AsyncSessionFactory"
        ) as mock_session_factory_cls:
            mock_session = AsyncMock()
            mock_session_factory_cls.return_value.__aenter__.return_value = mock_session
            mock_session_factory_cls.return_value.__aexit__.return_value = None

            with patch(
                "src.infrastructure.repositories.sqlalchemy_job_repository.SQLAlchemyJobRepository"
            ) as mock_repo_class:
                mock_repo = AsyncMock()
                mock_repo_class.return_value = mock_repo
                mock_repo.list_completed_unmatched_analyses = AsyncMock(return_value=analyses[:5])

                with patch("src.interface.workers.matching_tasks.match_analysis_to_job") as mock_celery:
                    mock_celery.apply_async = MagicMock()

                    count = await enqueue_job_publication_matches(job_id)

                    assert count == 5


@pytest.mark.asyncio
async def test_enqueue_job_publication_no_limit():
    """Test that no limit is applied when MATCHING_AUTO_FANOUT_LIMIT is 0."""
    job_id = uuid4()
    analyses = [MagicMock(id=uuid4()) for _ in range(100)]

    with patch("src.core.settings.settings") as mock_settings:
        mock_settings.ENABLE_DEV_MOCK = False
        mock_settings.MATCHING_AUTO_FANOUT_LIMIT = 0

        with patch(
            "src.infrastructure.database.connection.AsyncSessionFactory"
        ) as mock_session_factory_cls:
            mock_session = AsyncMock()
            mock_session_factory_cls.return_value.__aenter__.return_value = mock_session
            mock_session_factory_cls.return_value.__aexit__.return_value = None

            with patch(
                "src.infrastructure.repositories.sqlalchemy_job_repository.SQLAlchemyJobRepository"
            ) as mock_repo_class:
                mock_repo = AsyncMock()
                mock_repo_class.return_value = mock_repo
                mock_repo.list_completed_unmatched_analyses = AsyncMock(return_value=analyses)

                with patch("src.interface.workers.matching_tasks.match_analysis_to_job") as mock_celery:
                    mock_celery.apply_async = MagicMock()

                    count = await enqueue_job_publication_matches(job_id)

                    assert count == 100
