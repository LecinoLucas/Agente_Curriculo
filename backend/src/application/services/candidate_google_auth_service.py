from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_profile_completion_service import CandidateProfileCompletionService
from src.application.services.candidate_portal_auth_service import CandidatePortalAuthService
from src.application.services.candidate_service import APPLICATION_SOURCE_GOOGLE, APPLICATION_SOURCE_PUBLIC
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.repositories.sqlalchemy_candidate_repository import SQLAlchemyCandidateRepository
from src.infrastructure.security.google_identity_verifier import (
    GoogleIdentity,
    GoogleIdentityVerifier,
)
from src.interface.api.schemas.candidate_portal_schemas import (
    CandidateAuthGoogleCandidateResponse,
    CandidateAuthGoogleResponse,
)

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")


class CandidateGoogleAuthConflictError(Exception):
    pass


class CandidateGoogleAuthEmailNotVerifiedError(Exception):
    pass


class CandidateGoogleAuthService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        verifier: GoogleIdentityVerifier | None = None,
    ) -> None:
        self._db = db
        self._candidate_repo = SQLAlchemyCandidateRepository(db)
        self._verifier = verifier or GoogleIdentityVerifier()

    async def authenticate(
        self,
        *,
        id_token: str,
        ip_address: str,
        user_agent: str,
    ) -> tuple[str, CandidateAuthGoogleResponse]:
        identity = await self._verifier.verify(id_token)
        if not identity.email_verified:
            raise CandidateGoogleAuthEmailNotVerifiedError

        candidate = await self._find_or_create_candidate(identity)
        completion_state = await CandidateProfileCompletionService(self._db).get_completion_state(candidate.id)

        candidate.updated_at = datetime.now(UTC)
        candidate.last_login_at = datetime.now(UTC)
        session_token, session_expires_at = await CandidatePortalAuthService(self._db).create_session(
            candidate_id=candidate.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        status = "authenticated" if not completion_state.missing_fields else "needs_completion"
        return session_token, CandidateAuthGoogleResponse(
            status=status,
            message=(
                "Login com Google realizado com sucesso."
                if status == "authenticated"
                else "Complete os dados restantes para finalizar sua candidatura."
            ),
            redirect_to="/candidato/portal" if status == "authenticated" else "/candidato/cadastro",
            session_expires_at=session_expires_at,
            candidate=CandidateAuthGoogleCandidateResponse(
                id=candidate.id,
                full_name=candidate.full_name,
                email=candidate.email,
                phone=candidate.phone,
                cpf=candidate.cpf,
                salary_expectation=candidate.salary_expectation,
                has_resume=completion_state.has_resume,
                picture_url=candidate.google_picture_url,
                email_locked=bool(candidate.email),
            ),
            missing_fields=completion_state.missing_fields,
        )

    async def _find_or_create_candidate(self, identity: GoogleIdentity) -> CandidateModel:
        candidate_by_google = await self._find_active_by_google_sub(identity.sub)
        candidate_by_email = await self._candidate_repo.find_active_by_email(identity.email)

        if (
            candidate_by_google is not None
            and candidate_by_email is not None
            and candidate_by_google.id != candidate_by_email.id
        ):
            raise CandidateGoogleAuthConflictError

        candidate = candidate_by_google or candidate_by_email
        if candidate is None:
            candidate = CandidateModel(
                id=uuid4(),
                full_name=(identity.name or identity.email).strip(),
                email=identity.email,
                created_by=SYSTEM_USER_ID,
                application_source=APPLICATION_SOURCE_GOOGLE,
                google_sub=identity.sub,
                google_picture_url=identity.picture,
            )
            self._db.add(candidate)
            await self._db.flush()
            return candidate

        if candidate.google_sub and candidate.google_sub != identity.sub:
            raise CandidateGoogleAuthConflictError

        candidate.google_sub = identity.sub
        candidate.google_picture_url = identity.picture
        if not candidate.full_name.strip() and identity.name:
            candidate.full_name = identity.name.strip()
        if not candidate.email:
            candidate.email = identity.email
        elif candidate.email.lower().strip() != identity.email:
            existing_email_owner = await self._candidate_repo.find_active_by_email(identity.email)
            if existing_email_owner is not None and existing_email_owner.id != candidate.id:
                raise CandidateGoogleAuthConflictError

        if candidate.application_source in {None, "", "manual"}:
            candidate.application_source = APPLICATION_SOURCE_PUBLIC
        await self._db.flush()
        return candidate

    async def _find_active_by_google_sub(self, google_sub: str) -> CandidateModel | None:
        return await self._candidate_repo.find_active_by_google_sub(google_sub)
