from datetime import datetime, timezone

from src.domain.entities.user import User
from src.domain.repositories.user_repository import UserRepository


class InvalidProfileTextError(Exception):
    pass


class UserProfileService:
    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def update_me(self, current_user: User, full_name: str | None) -> User:
        if full_name is not None:
            current_user.full_name = self._clean_required_text(full_name)

        current_user.updated_at = datetime.now(timezone.utc)
        return await self._repository.save(current_user)

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidProfileTextError
        return cleaned
