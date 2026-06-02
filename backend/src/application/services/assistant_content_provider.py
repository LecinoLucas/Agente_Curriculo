"""AssistantContentProvider — OP-6H-3F

Loads prompt texts and quick replies from the ``assistant_*`` tables and
falls back transparently to the hardcoded defaults in
``conversation_state_machine.prompt_for()`` when the DB has no valid row or
returns an error.

Safety guarantees
-----------------
* DB errors never propagate to callers — they are logged at WARNING level and
  the hardcoded default is used instead.
* Every quick-reply value loaded from DB is validated against
  ``ALLOWED_QUICK_REPLY_VALUES[state]`` before being accepted; unknown values
  are silently discarded.
* Placeholders embedded in DB texts are not rendered here; they are rendered
  later by the same call-sites that already render the hardcoded templates
  (e.g. ``location_hint``).  The provider only ensures the text strings are
  non-empty after stripping.
* State-machine topology (transitions, which states exist) is NEVER read from
  the DB and NEVER modified.
* Settings (``assistant_settings``) are intentionally kept out of the read
  path in this phase.  A follow-up phase can layer them in safely.
"""
from __future__ import annotations

import logging
import re
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assistant_settings_catalog import (
    ALLOWED_QUICK_REPLY_VALUES,
    PLACEHOLDER_PATTERN,
)
from src.application.services.conversation_state_machine import (
    ConversationPrompt,
    prompt_for,
)
from src.infrastructure.database.models.assistant_settings_model import (
    AssistantQuickReplyModel,
    AssistantStateContentModel,
)

_logger = logging.getLogger(__name__)

# States that carry anti-enumeration or security properties.  Even if their DB
# content is edited, the engine still uses the hardcoded logic for those
# states (IDENTIFY anti-enumeration copy, OTP texts) because ConversationService
# handles them with dedicated _handle_identify / _handle_verify_otp paths that
# build ConversationPrompts directly rather than through prompt_for().
#
# Including them here means the provider simply returns the hardcoded default,
# which is the safe no-op for those states.
_SENSITIVE_STATES = frozenset({"IDENTIFY", "VERIFY_OTP"})

# Lead-registration states are engine-internal and have no rows in
# assistant_state_contents / assistant_quick_replies.  Skip DB lookups.
_LEAD_STATES = frozenset(
    {"COLLECT_LEAD_NAME", "COLLECT_LEAD_WHATSAPP", "COLLECT_LGPD_CONSENT"}
)


def _is_valid_text(text: str | None) -> bool:
    """A non-empty string after stripping is the only validity condition."""
    return bool(text and text.strip())


def _render(template: str, context: dict[str, Any]) -> str:
    """Substitute {key} placeholders from *context*.

    Unknown placeholders are left as-is so they remain visible in logs.
    """
    def _replace(m: re.Match[str]) -> str:  # type: ignore[type-arg]
        key = m.group(1)
        val = context.get(key)
        return str(val) if val is not None else m.group(0)

    return PLACEHOLDER_PATTERN.sub(_replace, template)


class AssistantContentProvider:
    """Async helper for loading assistant content from the DB with fallback.

    Instantiate once per request (the DB session is per-request).  Each
    ``prompt_for_state`` call performs two lightweight queries (one for
    state_content, one for quick_replies).  Results are not cached within the
    request because a single conversation turn normally calls this at most
    once or twice.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def prompt_for_state(
        self,
        state: str,
        context: dict[str, Any] | None = None,
    ) -> ConversationPrompt:
        """Return a ConversationPrompt for *state*, preferring DB content.

        Falls back to the hardcoded ``prompt_for()`` under any of these
        conditions:

        * *state* is in ``_SENSITIVE_STATES`` (security / anti-enum)
        * *state* is in ``_LEAD_STATES`` (engine-internal, no DB rows)
        * No active row exists in ``assistant_state_contents``
        * The row's ``prompt_text`` is empty/None
        * A DB error occurs

        Quick replies are loaded independently; if none are valid, the
        hardcoded ones are used.
        """
        ctx = context or {}

        if state in _SENSITIVE_STATES or state in _LEAD_STATES:
            return prompt_for(state, ctx)

        hardcoded = prompt_for(state, ctx)

        # ── Load state content ────────────────────────────────────────────
        try:
            row: AssistantStateContentModel | None = await self._db.scalar(
                sa.select(AssistantStateContentModel).where(
                    AssistantStateContentModel.state == state,
                    AssistantStateContentModel.is_active.is_(True),
                )
            )
        except Exception:
            _logger.warning(
                "assistant_content_provider.state_content.db_error",
                extra={"state": state},
                exc_info=True,
            )
            return hardcoded

        if row is None or not _is_valid_text(row.prompt_text):
            return hardcoded

        # Render placeholders in the DB text (e.g. {location_hint}).
        prompt_text = _render(row.prompt_text, ctx)
        if not _is_valid_text(prompt_text):
            return hardcoded

        # ── Load quick replies ────────────────────────────────────────────
        db_quick_replies = await self._load_quick_replies(state)

        # Fall back to hardcoded quick replies if the DB returned nothing valid.
        quick_replies = db_quick_replies if db_quick_replies else hardcoded.quick_replies

        return ConversationPrompt(
            state=hardcoded.state,  # type: ignore[arg-type]
            content=prompt_text,
            quick_replies=quick_replies,
        )

    async def _load_quick_replies(
        self, state: str
    ) -> tuple[tuple[str, str], ...]:
        """Load active, catalogue-valid quick replies for *state* from DB.

        Returns an empty tuple when none are valid (caller falls back to
        hardcoded).
        """
        allowed = set(ALLOWED_QUICK_REPLY_VALUES.get(state, ()))
        if not allowed:
            return ()

        try:
            rows = (
                await self._db.execute(
                    sa.select(AssistantQuickReplyModel)
                    .where(
                        AssistantQuickReplyModel.state == state,
                        AssistantQuickReplyModel.is_active.is_(True),
                    )
                    .order_by(
                        AssistantQuickReplyModel.sort_order,
                        AssistantQuickReplyModel.id,
                    )
                )
            ).scalars().all()
        except Exception:
            _logger.warning(
                "assistant_content_provider.quick_replies.db_error",
                extra={"state": state},
                exc_info=True,
            )
            return ()

        valid: list[tuple[str, str]] = []
        for row in rows:
            if row.value not in allowed:
                _logger.warning(
                    "assistant_content_provider.quick_reply.invalid_value",
                    extra={"state": state, "value": row.value},
                )
                continue
            if not _is_valid_text(row.label):
                continue
            valid.append((row.value, row.label))

        return tuple(valid)
