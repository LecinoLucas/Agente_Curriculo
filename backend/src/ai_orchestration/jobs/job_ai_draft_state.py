from typing import TypedDict

from src.application.services.job_ai_draft_rules import AiDraftFields, AiDraftUsage

class JobAiDraftState(TypedDict, total=False):
    # Inputs
    text_input: str | None
    ocr_text: str | None
    
    # Processed Inputs
    combined_text: str
    text_used: bool
    ocr_used: bool
    input_character_count: int
    
    # AI Output
    raw_content: str
    usage: AiDraftUsage
    
    # Parsed Outputs
    draft: AiDraftFields
    warnings: list[str]
    needs_review: list[str]
    missing_fields: list[str]
    quality_score: float | None
    
    # Errors
    error_type: str | None
    error_message: str | None
