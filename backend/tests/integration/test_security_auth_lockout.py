"""
Testes de segurança: account locking para staff e portal candidato.

Cobre achados A-H2 e A-H3 da auditoria de segurança Fase 1.
"""
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import MAX_FAILED_LOGINS, LOCKOUT_DURATION_MINUTES, User, UserRole

# Fase 30B — anti brute-force (staff + candidato): segurança crítica.
pytestmark = pytest.mark.smoke
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _create_staff_user(
    db_session: AsyncSession,
    email: str = "staff@security.example.com",
    password: str = "correct_password",
    role: UserRole = UserRole.RECRUITER,
) -> User:
    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name="Security Test User",
        role=role,
        is_active=True,
    )
    await repo.save(user)
    await db_session.commit()
    return user


async def _create_candidate(
    db_session: AsyncSession,
    email: str = "candidate@security.example.com",
    password: str = "correct_password",
) -> CandidateModel:
    from uuid import uuid4
    candidate = CandidateModel(
        email=email,
        full_name="Security Test Candidate",
        password_hash=hash_password(password),
        created_by=uuid4(),
    )
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


# ── A-H2: Staff account locking ──────────────────────────────────────────────


class TestStaffAccountLocking:
    """Testa bloqueio de conta staff após tentativas inválidas."""

    @pytest.mark.asyncio
    async def test_account_not_locked_before_threshold(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Tentativas abaixo do limite não bloqueiam a conta."""
        await _create_staff_user(db_session, "below@threshold.example.com")

        for _ in range(MAX_FAILED_LOGINS - 1):
            r = await client.post(
                "/api/v1/auth/login",
                json={"email": "below@threshold.example.com", "password": "wrongpassword"},
            )
            assert r.status_code == 401

        # Última tentativa ainda deve retornar 401, não 423 (ainda não bloqueou)
        r = await client.post(
            "/api/v1/auth/login",
            json={"email": "below@threshold.example.com", "password": "correct_password"},
        )
        assert r.status_code == 200, "Login correto antes do bloqueio deve funcionar"

    @pytest.mark.asyncio
    async def test_account_locked_after_max_failed_logins(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Conta é bloqueada após atingir MAX_FAILED_LOGINS tentativas inválidas."""
        await _create_staff_user(db_session, "lockme@staff.example.com")

        for _ in range(MAX_FAILED_LOGINS):
            await client.post(
                "/api/v1/auth/login",
                json={"email": "lockme@staff.example.com", "password": "wrongpassword"},
            )

        # Próxima tentativa (mesmo com senha correta) deve retornar 401 por bloqueio
        r = await client.post(
            "/api/v1/auth/login",
            json={"email": "lockme@staff.example.com", "password": "correct_password"},
        )
        assert r.status_code == 401
        assert "bloqueada" in r.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_locked_account_message_does_not_reveal_email_status_for_wrong_email(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Tentativa com email inexistente retorna 401 genérico, não vaza existência."""
        r = await client.post(
            "/api/v1/auth/login",
            json={"email": "doesnotexist@security.example.com", "password": "anything"},
        )
        assert r.status_code == 401
        assert "bloqueada" not in r.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_failed_login_count_persists_in_db(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """failed_login_count é incrementado e persistido no banco."""
        from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository

        user = await _create_staff_user(db_session, "counter@staff.example.com")
        repo = SQLAlchemyUserRepository(db_session)

        await client.post(
            "/api/v1/auth/login",
            json={"email": "counter@staff.example.com", "password": "wrongpassword"},
        )

        refreshed = await repo.find_by_id(user.id)
        assert refreshed is not None
        assert refreshed.failed_login_count == 1

    @pytest.mark.asyncio
    async def test_locked_until_is_set_after_max_failures(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """locked_until é definido após MAX_FAILED_LOGINS tentativas."""
        from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository

        user = await _create_staff_user(db_session, "lockuntil@staff.example.com")
        repo = SQLAlchemyUserRepository(db_session)

        for _ in range(MAX_FAILED_LOGINS):
            await client.post(
                "/api/v1/auth/login",
                json={"email": "lockuntil@staff.example.com", "password": "wrongpassword"},
            )

        refreshed = await repo.find_by_id(user.id)
        assert refreshed is not None
        assert refreshed.locked_until is not None
        lu = refreshed.locked_until
        if lu.tzinfo is None:
            lu = lu.replace(tzinfo=timezone.utc)
        expected_min = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES - 1)
        assert lu > expected_min, "locked_until deve estar no futuro"

    @pytest.mark.asyncio
    async def test_successful_login_resets_counter_and_lock(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Login bem-sucedido reseta failed_login_count e locked_until."""
        from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository

        user = await _create_staff_user(db_session, "resetme@staff.example.com")
        repo = SQLAlchemyUserRepository(db_session)

        # Acumula algumas falhas
        for _ in range(MAX_FAILED_LOGINS - 1):
            await client.post(
                "/api/v1/auth/login",
                json={"email": "resetme@staff.example.com", "password": "wrongpassword"},
            )

        # Login correto
        r = await client.post(
            "/api/v1/auth/login",
            json={"email": "resetme@staff.example.com", "password": "correct_password"},
        )
        assert r.status_code == 200

        refreshed = await repo.find_by_id(user.id)
        assert refreshed is not None
        assert refreshed.failed_login_count == 0
        assert refreshed.locked_until is None

    @pytest.mark.asyncio
    async def test_account_locked_returns_401_not_500(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Conta bloqueada retorna 401, nunca 500."""
        await _create_staff_user(db_session, "no500@staff.example.com")

        for _ in range(MAX_FAILED_LOGINS + 2):
            r = await client.post(
                "/api/v1/auth/login",
                json={"email": "no500@staff.example.com", "password": "wrongpassword"},
            )
            assert r.status_code in (401, 429), f"Esperado 401/429, recebeu {r.status_code}"


# ── A-H3: Candidate portal brute force protection ────────────────────────────


class TestCandidatePortalLockout:
    """Testa proteção anti-brute-force no portal do candidato via Redis."""

    @pytest.mark.asyncio
    async def test_candidate_login_fails_with_wrong_password(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Login com senha errada retorna 401."""
        await _create_candidate(db_session, "cand@portal.example.com")

        r = await client.post(
            "/api/v1/public/candidate-auth/login",
            json={"email": "cand@portal.example.com", "password": "wrongpassword"},
        )
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_candidate_portal_locked_after_max_failures(
        self, client: AsyncClient, db_session: AsyncSession, fake_redis
    ) -> None:
        """Portal candidato bloqueia após MAX_CANDIDATE_FAILED_LOGINS tentativas."""
        from src.application.services.candidate_portal_auth_service import MAX_CANDIDATE_FAILED_LOGINS

        await _create_candidate(db_session, "lockme@portal.example.com")

        for _ in range(MAX_CANDIDATE_FAILED_LOGINS):
            await client.post(
                "/api/v1/public/candidate-auth/login",
                json={"email": "lockme@portal.example.com", "password": "wrongpassword"},
            )

        # Próxima tentativa deve ser bloqueada (mesmo com senha correta)
        r = await client.post(
            "/api/v1/public/candidate-auth/login",
            json={"email": "lockme@portal.example.com", "password": "correct_password"},
        )
        assert r.status_code == 429
        assert "bloqueada" in r.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_candidate_not_locked_before_threshold(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Tentativas abaixo do limite não bloqueiam candidato."""
        from src.application.services.candidate_portal_auth_service import MAX_CANDIDATE_FAILED_LOGINS

        await _create_candidate(db_session, "nolockyet@portal.example.com")

        for _ in range(MAX_CANDIDATE_FAILED_LOGINS - 1):
            r = await client.post(
                "/api/v1/public/candidate-auth/login",
                json={"email": "nolockyet@portal.example.com", "password": "wrongpassword"},
            )
            assert r.status_code == 401

        # Login correto ainda deve funcionar
        r = await client.post(
            "/api/v1/public/candidate-auth/login",
            json={"email": "nolockyet@portal.example.com", "password": "correct_password"},
        )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_candidate_successful_login_clears_attempts(
        self, client: AsyncClient, db_session: AsyncSession, fake_redis
    ) -> None:
        """Login bem-sucedido limpa o contador de tentativas."""
        from src.application.services.candidate_portal_auth_service import (
            MAX_CANDIDATE_FAILED_LOGINS,
            _ATTEMPTS_KEY_PREFIX,
            CandidatePortalAuthService,
        )

        await _create_candidate(db_session, "clearme@portal.example.com")

        # Algumas falhas
        for _ in range(MAX_CANDIDATE_FAILED_LOGINS - 1):
            await client.post(
                "/api/v1/public/candidate-auth/login",
                json={"email": "clearme@portal.example.com", "password": "wrongpassword"},
            )

        # Login correto
        r = await client.post(
            "/api/v1/public/candidate-auth/login",
            json={"email": "clearme@portal.example.com", "password": "correct_password"},
        )
        assert r.status_code == 200

        # Contador deve estar zerado (pode logar novamente sem bloqueio)
        r2 = await client.post(
            "/api/v1/public/candidate-auth/login",
            json={"email": "clearme@portal.example.com", "password": "correct_password"},
        )
        assert r2.status_code == 200

    @pytest.mark.asyncio
    async def test_candidate_lockout_returns_429_not_401(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Resposta de bloqueio é 429, não 401 (distingue de credencial errada)."""
        from src.application.services.candidate_portal_auth_service import MAX_CANDIDATE_FAILED_LOGINS

        await _create_candidate(db_session, "status429@portal.example.com")

        for _ in range(MAX_CANDIDATE_FAILED_LOGINS):
            await client.post(
                "/api/v1/public/candidate-auth/login",
                json={"email": "status429@portal.example.com", "password": "wrongpassword"},
            )

        r = await client.post(
            "/api/v1/public/candidate-auth/login",
            json={"email": "status429@portal.example.com", "password": "wrongpassword"},
        )
        assert r.status_code == 429


# ── User entity unit tests ────────────────────────────────────────────────────


class TestUserEntityLocking:
    """Testa a lógica de locking diretamente na entidade User."""

    def test_record_failed_login_sets_locked_until_at_threshold(self) -> None:
        """locked_until é definido exatamente quando failed_login_count atinge MAX."""
        user = User.create(
            email="unit@test.com",
            password_hash="hash",
            full_name="Unit",
            is_active=True,
        )
        assert user.locked_until is None

        for i in range(MAX_FAILED_LOGINS - 1):
            user.record_failed_login()
            assert user.locked_until is None, f"Não deve bloquear na tentativa {i + 1}"

        user.record_failed_login()  # tentativa MAX_FAILED_LOGINS
        assert user.locked_until is not None
        assert user.is_locked is True

    def test_record_successful_login_clears_lock(self) -> None:
        """record_successful_login reseta failed_login_count e locked_until."""
        user = User.create(
            email="unlock@test.com",
            password_hash="hash",
            full_name="Unlock",
            is_active=True,
        )
        for _ in range(MAX_FAILED_LOGINS):
            user.record_failed_login()

        assert user.is_locked is True

        user.record_successful_login()

        assert user.failed_login_count == 0
        assert user.locked_until is None
        assert user.is_locked is False

    def test_locked_until_duration_matches_constant(self) -> None:
        """locked_until está aproximadamente LOCKOUT_DURATION_MINUTES no futuro."""
        user = User.create(
            email="duration@test.com",
            password_hash="hash",
            full_name="Duration",
            is_active=True,
        )
        before = datetime.now(timezone.utc)
        for _ in range(MAX_FAILED_LOGINS):
            user.record_failed_login()
        after = datetime.now(timezone.utc)

        assert user.locked_until is not None
        expected_min = before + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        expected_max = after + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        assert expected_min <= user.locked_until <= expected_max
