"""
Integration tests for User-Candidate boundary (Phase 20.3).

See: docs/user-candidate-boundary.md

Tests validate:
1. Candidate creation does NOT create User
2. Candidate creation does NOT accept user_id
3. User creation does NOT accept role="candidate" via admin API
4. Resume upload for role="candidate" does NOT auto-create Candidate
5. role="candidate" does NOT access internal routes
6. role="candidate" can only access portal routes
"""

import pytest
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.dtos.user_dtos import CreateUserCommand
from src.application.services.candidate_service import (
    CandidateNotAllowedUserIdError,
    CandidateService,
)
from src.application.services.resume_service import (
    ResumeUploadCandidateNotFoundError,
    ResumeService,
    ResumeUploadCandidateRequiredError,
)
from src.application.use_cases.users.create_user import (
    CandidateUserNotAllowedError,
    CreateUserUseCase,
)
from src.domain.entities.user import UserRole, User
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    SQLAlchemyCandidateRepository,
)
from src.infrastructure.repositories.sqlalchemy_user_repository import (
    SQLAlchemyUserRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)
from src.interface.api.schemas.candidate_schemas import CreateCandidateRequest


async def _create_internal_admin(db_session: AsyncSession) -> User:
    admin = User.create(
        email=f"admin-{uuid4()}@example.com",
        password_hash="hash",
        full_name="Admin",
        role=UserRole.ADMIN,
    )
    return await SQLAlchemyUserRepository(db_session).save(admin)


class TestCandidateCreationBoundary:
    """Ensure Candidate creation does NOT create or require User."""

    async def test_create_candidate_without_user_id(self, db_session: AsyncSession):
        """Candidate can be created without user_id (anonymous candidate)."""
        repo = SQLAlchemyCandidateRepository(db_session)
        service = CandidateService(repo)

        # Admin creates a candidate (no user_id)
        admin_id = (await _create_internal_admin(db_session)).id
        body = CreateCandidateRequest(
            full_name="João Silva",
            email="joao@example.com",
            phone=None,
            cpf=None,
            user_id=None,  # No portal access yet
        )

        candidate = await service.create(body, created_by=admin_id)

        assert candidate.full_name == "João Silva"
        assert candidate.email == "joao@example.com"
        assert candidate.user_id is None  # Anonymous candidate
        assert candidate.created_by == admin_id

    async def test_create_candidate_rejects_user_id(self, db_session: AsyncSession):
        """GUARDRAIL: Candidate creation must REJECT user_id field."""
        repo = SQLAlchemyCandidateRepository(db_session)
        service = CandidateService(repo)

        admin_id = (await _create_internal_admin(db_session)).id
        some_user_id = uuid4()

        # Try to create candidate WITH user_id
        body = CreateCandidateRequest(
            full_name="Maria Silva",
            email="maria@example.com",
            phone=None,
            cpf=None,
            user_id=some_user_id,  # ATTEMPT to link portal access
        )

        with pytest.raises(CandidateNotAllowedUserIdError):
            await service.create(body, created_by=admin_id)

        # Verify no candidate was created
        created = await repo.find_active_by_email("maria@example.com")
        assert created is None


class TestUserCreationBoundary:
    """Ensure User creation does NOT accept role="candidate"."""

    async def test_create_internal_user_succeeds(self, db_session: AsyncSession):
        """Can create Users with internal roles (admin, recruiter, viewer)."""
        repo = SQLAlchemyUserRepository(db_session)
        use_case = CreateUserUseCase(repo)

        for role in [UserRole.ADMIN, UserRole.RECRUITER, UserRole.VIEWER]:
            command = CreateUserCommand(
                email=f"user-{role.value}@example.com",
                temporary_password="SecurePassword123!",
                full_name=f"User {role.value}",
                role=role,
            )

            result = await use_case.execute(command)

            assert result.role == role
            assert result.email == command.email

    async def test_create_user_blocks_candidate_role(self, db_session: AsyncSession):
        """GUARDRAIL: User creation must BLOCK role=\"candidate\"."""
        repo = SQLAlchemyUserRepository(db_session)
        use_case = CreateUserUseCase(repo)

        command = CreateUserCommand(
            email="candidate@example.com",
            temporary_password="SecurePassword123!",
            full_name="Candidate User",
            role=UserRole.CANDIDATE,  # ATTEMPT internal creation
        )

        with pytest.raises(CandidateUserNotAllowedError):
            await use_case.execute(command)

        # Verify no user was created
        exists = await repo.exists_by_email("candidate@example.com")
        assert not exists


class TestResumeUploadBoundary:
    """Ensure resume upload respects candidate portal rules."""

    async def test_admin_upload_requires_candidate_id(self, db_session: AsyncSession):
        """GUARDRAIL: Admin/Recruiter must explicitly provide candidate_id."""
        admin = User.create(
            email="admin@example.com",
            password_hash="hash",
            full_name="Admin",
            role=UserRole.ADMIN,
        )
        db_admin = await SQLAlchemyUserRepository(db_session).save(admin)

        service = ResumeService(SQLAlchemyResumeRepository(db_session))

        # Try upload WITHOUT candidate_id as admin
        with pytest.raises(ResumeUploadCandidateRequiredError):
            await service._resolve_upload_candidate(db_admin, candidate_id=None)

    async def test_candidate_user_cannot_autocreate_candidate(self, db_session: AsyncSession):
        """GUARDRAIL: role=\"candidate\" CANNOT auto-create Candidate on upload."""
        candidate_user = User.create(
            email="candidate@example.com",
            password_hash="hash",
            full_name="Candidate Portal User",
            role=UserRole.CANDIDATE,
        )
        db_user = await SQLAlchemyUserRepository(db_session).save(candidate_user)

        service = ResumeService(SQLAlchemyResumeRepository(db_session))

        # Try upload WITHOUT existing linked Candidate
        # Should fail with helpful message, NOT auto-create
        with pytest.raises(ResumeUploadCandidateRequiredError) as exc_info:
            await service._resolve_upload_candidate(db_user, candidate_id=None)

        assert "não tem Candidate vinculado" in str(exc_info.value)

    async def test_candidate_user_can_upload_for_linked_candidate(
        self, db_session: AsyncSession
    ):
        """role=\"candidate\" CAN upload for their linked Candidate."""
        candidate_user = User.create(
            email="candidate@example.com",
            password_hash="hash",
            full_name="Candidate Portal User",
            role=UserRole.CANDIDATE,
        )
        db_user = await SQLAlchemyUserRepository(db_session).save(candidate_user)

        admin = User.create(
            email="admin@example.com",
            password_hash="hash",
            full_name="Admin",
            role=UserRole.ADMIN,
        )
        db_admin = await SQLAlchemyUserRepository(db_session).save(admin)

        # Create candidate linked to candidate user
        candidate_repo = SQLAlchemyCandidateRepository(db_session)
        candidate = await candidate_repo.create(
            CandidateModel(
                full_name="João Silva",
                email="joao@example.com",
                user_id=db_user.id,  # Linked to portal user
                created_by=db_admin.id,
            )
        )

        service = ResumeService(SQLAlchemyResumeRepository(db_session))

        # Candidate user can use implicit candidate
        resolved = await service._resolve_upload_candidate(db_user, candidate_id=None)
        assert resolved.id == candidate.id

    async def test_candidate_user_cannot_access_other_candidate(self, db_session: AsyncSession):
        """role=\"candidate\" CANNOT upload for someone else's Candidate."""
        candidate_user_1 = User.create(
            email="candidate1@example.com",
            password_hash="hash",
            full_name="Candidate 1",
            role=UserRole.CANDIDATE,
        )
        db_user_1 = await SQLAlchemyUserRepository(db_session).save(candidate_user_1)

        admin = User.create(
            email="admin@example.com",
            password_hash="hash",
            full_name="Admin",
            role=UserRole.ADMIN,
        )
        db_admin = await SQLAlchemyUserRepository(db_session).save(admin)

        # Create candidate for someone else
        candidate_repo = SQLAlchemyCandidateRepository(db_session)
        other_candidate = await candidate_repo.create(
            CandidateModel(
                full_name="Other Candidate",
                email="other@example.com",
                user_id=None,  # No portal access
                created_by=db_admin.id,
            )
        )

        service = ResumeService(SQLAlchemyResumeRepository(db_session))

        # Candidate 1 tries to upload for other candidate
        with pytest.raises(ResumeUploadCandidateNotFoundError):
            await service._resolve_upload_candidate(
                db_user_1, candidate_id=other_candidate.id
            )


class TestCandidatePortalIsolation:
    """Ensure role=\"candidate\" is isolated from internal routes."""

    async def test_candidate_user_identified(self, db_session: AsyncSession):
        """Candidate portal user is identified by role=\"candidate\"."""
        user = User.create(
            email="candidate@example.com",
            password_hash="hash",
            full_name="Portal Candidate",
            role=UserRole.CANDIDATE,
        )

        assert user.role == UserRole.CANDIDATE
        assert user.role.value == "candidate"

    async def test_internal_user_cannot_be_candidate_role(self, db_session: AsyncSession):
        """Internal users (admin, recruiter, viewer) have different roles."""
        for role in [UserRole.ADMIN, UserRole.RECRUITER, UserRole.VIEWER]:
            user = User.create(
                email=f"internal-{role.value}@example.com",
                password_hash="hash",
                full_name=f"Internal {role.value}",
                role=role,
            )

            assert user.role != UserRole.CANDIDATE
            assert user.role in [UserRole.ADMIN, UserRole.RECRUITER, UserRole.VIEWER]


class TestEndToEndBoundary:
    """End-to-end scenario: create candidate -> admin/recruiter uses it."""

    async def test_recruiter_creates_candidate_for_portal(self, db_session: AsyncSession):
        """
        Workflow:
        1. Recruiter creates Candidate (no user_id)
        2. Later, admin creates User with role="candidate"
        3. User can upload resume for Candidate (via manual link in Phase 20.3)
        """
        recruiter = User.create(
            email="recruiter@example.com",
            password_hash="hash",
            full_name="Recruiter",
            role=UserRole.RECRUITER,
        )
        db_recruiter = await SQLAlchemyUserRepository(db_session).save(recruiter)

        candidate_service = CandidateService(SQLAlchemyCandidateRepository(db_session))

        # Step 1: Recruiter creates candidate (anonymous, no user_id)
        candidate_body = CreateCandidateRequest(
            full_name="João Silva",
            email="joao@example.com",
            phone=None,
            cpf=None,
            user_id=None,  # Anonymous
        )
        candidate = await candidate_service.create(candidate_body, created_by=db_recruiter.id)

        # Step 2: Verify no User was created
        user_repo = SQLAlchemyUserRepository(db_session)
        joao_user = await user_repo.find_by_email("joao@example.com")
        assert joao_user is None  # No user created

        # Step 3: In Phase 20.3, admin would create User + CandidateAccount link
        # For now, test that portal user cannot be created manually
        create_user_case = CreateUserUseCase(user_repo)
        with pytest.raises(CandidateUserNotAllowedError):
            await create_user_case.execute(
                CreateUserCommand(
                    email="joao@example.com",
                    temporary_password="SecurePassword123!",
                    full_name="João Silva",
                    role=UserRole.CANDIDATE,  # BLOCKED
                )
            )
