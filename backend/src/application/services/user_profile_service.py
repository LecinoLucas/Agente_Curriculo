from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from src.domain.entities.user import User
from src.domain.repositories.user_repository import UserRepository


class InvalidProfileTextError(Exception):
    pass


class InvalidAvatarError(Exception):
    pass


class UserProfileService:
    AVATAR_DIR = Path(__file__).parent.parent.parent.parent / "uploads" / "avatars"
    MAX_AVATAR_BYTES = 2 * 1024 * 1024
    ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png"}

    # Magic bytes for file validation
    MAGIC_BYTES = {
        b'\xff\xd8\xff': ('jpg', 'image/jpeg'),
        b'\x89PNG': ('png', 'image/png'),
    }

    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def update_me(self, current_user: User, full_name: str | None) -> User:
        if full_name is not None:
            current_user.full_name = self._clean_required_text(full_name)

        current_user.updated_at = datetime.now(timezone.utc)
        return await self._repository.save(current_user)

    async def upload_avatar(self, current_user: User, file_content: bytes, content_type: str) -> User:
        if len(file_content) > self.MAX_AVATAR_BYTES:
            raise InvalidAvatarError("Arquivo muito grande (máximo 2MB)")

        ext, real_content_type = self._validate_and_detect_image_type(file_content)

        filename = f"{current_user.id}.{ext}"
        file_path = self.AVATAR_DIR / filename

        self.AVATAR_DIR.mkdir(parents=True, exist_ok=True)

        self._cleanup_old_avatars(current_user.id)

        file_path.write_bytes(file_content)

        now = int(datetime.now(timezone.utc).timestamp())
        current_user.avatar_url = f"/uploads/avatars/{filename}?v={now}"
        current_user.updated_at = datetime.now(timezone.utc)
        return await self._repository.save(current_user)

    def _validate_and_detect_image_type(self, file_content: bytes) -> tuple[str, str]:
        for magic_bytes, (ext, mime_type) in self.MAGIC_BYTES.items():
            if file_content.startswith(magic_bytes):
                return ext, mime_type
        raise InvalidAvatarError("Apenas JPEG e PNG são permitidos")

    def _cleanup_old_avatars(self, user_id: UUID) -> None:
        """Remove previous avatar files for this user."""
        if not self.AVATAR_DIR.exists():
            return
        for file in self.AVATAR_DIR.glob(f"{user_id}.*"):
            try:
                file.unlink()
            except OSError:
                pass

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidProfileTextError
        return cleaned
