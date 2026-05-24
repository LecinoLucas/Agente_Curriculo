from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from src.interface.workers import analysis_tasks


def test_prompt_validation_logs_metadata_without_prompt_preview(monkeypatch: pytest.MonkeyPatch) -> None:
    info = MagicMock()
    warning = MagicMock()
    monkeypatch.setattr(analysis_tasks.logger, "info", info)
    monkeypatch.setattr(analysis_tasks.logger, "warning", warning)

    prompt = "CURRICULO_RESUMIDO:\nemail@exemplo.com\ntelefone 91999999999"

    analysis_tasks._validate_prompt_before_ai(prompt=prompt, resume_chars=20, job_chars=10)

    assert info.call_args.kwargs["prompt_chars_total"] == len(prompt)
    assert "preview" not in info.call_args.kwargs
    assert prompt not in str(info.call_args)
    warning.assert_not_called()
