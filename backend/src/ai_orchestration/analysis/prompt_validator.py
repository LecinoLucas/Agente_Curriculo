import re

import structlog

from src.core.settings import settings

logger = structlog.get_logger(__name__)

PROMPT_SUSPICIOUS_PATTERNS = (
    r"(?i)ignore\s+previous\s+instructions",
    r"(?i)jailbreak",
    r"(?i)system\s*prompt",
    r"(?i)<script",
)


class AnalysisPromptTooLargeError(Exception):
    def __init__(
        self,
        reasons: list[str],
        prompt_chars: int,
        resume_chars: int,
        job_chars: int,
    ):
        super().__init__(f"Prompt blocked before AI call: {','.join(reasons)}")
        self.reasons = reasons
        self.prompt_chars = prompt_chars
        self.resume_chars = resume_chars
        self.job_chars = job_chars


def validate_prompt_before_ai(*, prompt: str, resume_chars: int, job_chars: int) -> None:
    reasons: list[str] = []
    total_chars = len(prompt)

    if resume_chars > int(settings.AI_ANALYSIS_MAX_RESUME_CHARS):
        reasons.append("resume_chars_exceeded")
    if job_chars > int(settings.AI_ANALYSIS_MAX_JOB_CHARS):
        reasons.append("job_chars_exceeded")
    if total_chars > int(settings.AI_ANALYSIS_MAX_PROMPT_CHARS):
        reasons.append("prompt_chars_exceeded")
    if "```" in prompt:
        reasons.append("markdown_detected")
    if re.search(r"(?i)\bmarkdown\b", prompt):
        reasons.append("markdown_word_detected")
    for pattern in PROMPT_SUSPICIOUS_PATTERNS:
        if re.search(pattern, prompt):
            reasons.append(f"suspicious:{pattern}")

    logger.info(
        "analysis.prompt_metrics",
        prompt_chars_total=total_chars,
        resume_chars=resume_chars,
        job_chars=job_chars,
    )

    if reasons:
        logger.warning(
            "analysis.prompt_invalid",
            reasons=reasons,
            prompt_chars_total=total_chars,
            resume_chars=resume_chars,
            job_chars=job_chars,
        )
        raise AnalysisPromptTooLargeError(
            reasons=reasons,
            prompt_chars=total_chars,
            resume_chars=resume_chars,
            job_chars=job_chars,
        )
