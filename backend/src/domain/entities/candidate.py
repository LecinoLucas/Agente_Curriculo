from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4


@dataclass
class Candidate:
    """
    Candidate - External entity representing a person being evaluated.

    User-Candidate Relationship:
    - Most candidates have user_id = NULL (anonymous)
    - Some candidates have user_id = UUID (can login to candidate portal)
    - user_id, when set, references a User with role="candidate"
    """
    id: UUID
    full_name: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    user_id: Optional[UUID] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    location_country: str = "BR"
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    internal_notes: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    deleted_at: Optional[datetime] = None
    data_quality_status: str = "unknown"
    data_quality_reason: Optional[str] = None
    data_quality_marked_at: Optional[datetime] = None

    @classmethod
    def create(
        cls,
        full_name: str,
        created_by: UUID,
        email: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> "Candidate":
        now = datetime.now(timezone.utc)
        return cls(
            id=uuid4(),
            full_name=full_name.strip(),
            email=email.lower().strip() if email else None,
            user_id=user_id,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        self.deleted_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def add_tag(self, tag: str) -> None:
        normalized = tag.lower().strip()
        if normalized not in self.tags:
            self.tags.append(normalized)
            self.updated_at = datetime.now(timezone.utc)
