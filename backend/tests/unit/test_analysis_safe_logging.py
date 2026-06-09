from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from src.ai_orchestration.analysis import prompt_validator as _prompt_validator_module
from src.interface.workers import analysis_tasks


def test_prompt_validation_logs_metadata_without_prompt_preview(monkeypatch: pytest.MonkeyPatch) -> None:
    # The logger now lives in prompt_validator (moved from analysis_tasks)
    info = MagicMock()
    warning = MagicMock()
    monkeypatch.setattr(_prompt_validator_module.logger, "info", info)
    monkeypatch.setattr(_prompt_validator_module.logger, "warning", warning)

    prompt = "CURRICULO_RESUMIDO:\nemail@exemplo.com\ntelefone 91999999999"

    analysis_tasks._validate_prompt_before_ai(prompt=prompt, resume_chars=20, job_chars=10)

    assert info.call_args.kwargs["prompt_chars_total"] == len(prompt)
    assert "preview" not in info.call_args.kwargs
    assert prompt not in str(info.call_args)
    warning.assert_not_called()
