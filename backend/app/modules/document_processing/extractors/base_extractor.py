from __future__ import annotations

from abc import ABC, abstractmethod


class BaseTextExtractor(ABC):
    @abstractmethod
    def extract_text(self, file_path: str) -> str:
        raise NotImplementedError

