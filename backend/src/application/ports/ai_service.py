from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class AIAnalysisRequest:
    resume_text: str
    prompt_template: str
    system_prompt: str
    max_tokens: int
    temperature: float
    job_description: str | None = None
    queue_name: str | None = None


@dataclass
class AIAnalysisResponse:
    content: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    processing_time_ms: int
    parsed_data: dict[str, Any] | None = None


class AIService(ABC):
    @abstractmethod
    async def analyze(self, request: AIAnalysisRequest) -> AIAnalysisResponse: ...
