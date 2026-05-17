from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from src.domain.entities.resume import Resume, ResumeVersion


class ResumeRepository(ABC):
    @abstractmethod
    async def find_by_id(self, resume_id: UUID) -> Optional[Resume]: ...

    @abstractmethod
    async def find_by_candidate(self, candidate_id: UUID) -> list[Resume]: ...

    @abstractmethod
    async def save(self, resume: Resume) -> Resume: ...

    @abstractmethod
    async def find_version(self, resume_version_id: UUID) -> Optional[ResumeVersion]: ...

    @abstractmethod
    async def save_version(self, version: ResumeVersion) -> ResumeVersion: ...

    @abstractmethod
    async def find_version_by_hash(self, file_hash: str) -> Optional[ResumeVersion]: ...
