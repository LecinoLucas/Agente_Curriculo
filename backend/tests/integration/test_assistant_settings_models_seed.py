from __future__ import annotations

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assistant_settings_catalog import (
    ALLOWED_QUICK_REPLY_VALUES,
    QUICK_REPLY_SEED,
    STATE_CONTENT_SEED,
    seed_assistant_configuration,
    validate_placeholders,
    validate_quick_reply_value,
    validate_setting_value,
)
from src.application.services.conversation_state_machine import first_prompt, prompt_for
from src.infrastructure.database.models.assistant_settings_model import (
    ASSISTANT_STATES,
    AssistantQuickReplyModel,
    AssistantSettingModel,
    AssistantStateContentModel,
)


async def test_assistant_settings_tables_exist(db_session: AsyncSession) -> None:
    connection = await db_session.connection()
    table_names = await connection.run_sync(
        lambda sync_connection: sa.inspect(sync_connection).get_table_names()
    )

    assert "assistant_state_contents" in table_names
    assert "assistant_quick_replies" in table_names
    assert "assistant_settings" in table_names


async def test_seed_creates_one_content_per_state(db_session: AsyncSession) -> None:
    await seed_assistant_configuration(db_session)
    await db_session.commit()

    rows = (
        await db_session.execute(
            sa.select(AssistantStateContentModel).order_by(AssistantStateContentModel.state)
        )
    ).scalars().all()

    assert len(rows) == len(ASSISTANT_STATES)
    assert {row.state for row in rows} == set(ASSISTANT_STATES)
    assert all(row.version == 1 for row in rows)


async def test_seed_creates_expected_quick_replies(db_session: AsyncSession) -> None:
    await seed_assistant_configuration(db_session)
    await db_session.commit()

    rows = (
        await db_session.execute(
            sa.select(AssistantQuickReplyModel).order_by(
                AssistantQuickReplyModel.state,
                AssistantQuickReplyModel.sort_order,
            )
        )
    ).scalars().all()

    seeded_pairs = {(row.state, row.value, row.label, row.sort_order) for row in rows}
    expected_pairs = {
        (seed.state, seed.value, seed.label, seed.sort_order) for seed in QUICK_REPLY_SEED
    }
    assert seeded_pairs == expected_pairs
    assert len(rows) == len(QUICK_REPLY_SEED)


async def test_seed_creates_expected_settings(db_session: AsyncSession) -> None:
    await seed_assistant_configuration(db_session)
    await db_session.commit()

    settings = {
        setting.key: setting
        for setting in (
            await db_session.execute(sa.select(AssistantSettingModel))
        ).scalars().all()
    }

    assert settings["default_max_attempts"].value_json == 3
    assert settings["channels_enabled"].value_json == ["web"]
    assert settings["channels_enabled"].is_sensitive is True


async def test_unique_state_constraint(db_session: AsyncSession) -> None:
    await seed_assistant_configuration(db_session)
    db_session.add(
        AssistantStateContentModel(
            state="CHOOSE_LOCATION",
            prompt_text="Duplicado",
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_unique_state_value_constraint(db_session: AsyncSession) -> None:
    await seed_assistant_configuration(db_session)
    db_session.add(
        AssistantQuickReplyModel(
            state="IDENTIFY",
            value="cpf",
            label="Duplicado",
            sort_order=99,
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.commit()


def test_unknown_placeholder_is_rejected() -> None:
    with pytest.raises(ValueError, match="Placeholder"):
        validate_placeholders("CHOOSE_LOCATION", "Texto com {location_hint} indevido")


def test_allowed_placeholder_is_accepted() -> None:
    validate_placeholders(
        "CHOOSE_UNIT_OR_ANY",
        "Encontrei {location_hint}. Você prefere um posto específico?",
    )


def test_unknown_quick_reply_value_is_rejected() -> None:
    with pytest.raises(ValueError, match="Quick reply value"):
        validate_quick_reply_value("CHOOSE_SHIFT", "dawn")


def test_allowed_quick_reply_catalog_matches_seed() -> None:
    seeded_by_state: dict[str, set[str]] = {state: set() for state in ASSISTANT_STATES}
    for seed in QUICK_REPLY_SEED:
        seeded_by_state[seed.state].add(seed.value)

    assert seeded_by_state == {
        state: set(values) for state, values in ALLOWED_QUICK_REPLY_VALUES.items()
    }


def test_whatsapp_setting_is_rejected_until_real_channel_exists() -> None:
    with pytest.raises(ValueError, match="channels_enabled"):
        validate_setting_value("channels_enabled", ["web", "whatsapp"])


async def test_identify_and_verify_otp_seed_are_not_editable(
    db_session: AsyncSession,
) -> None:
    await seed_assistant_configuration(db_session)
    await db_session.commit()

    rows = {
        row.state: row
        for row in (
            await db_session.execute(
                sa.select(AssistantStateContentModel).where(
                    AssistantStateContentModel.state.in_(("IDENTIFY", "VERIFY_OTP"))
                )
            )
        ).scalars().all()
    }

    assert rows["IDENTIFY"].is_editable is False
    assert rows["VERIFY_OTP"].is_editable is False


def test_seed_prompt_texts_match_current_state_machine_defaults() -> None:
    prompt_by_state = {seed.state: seed.prompt_text for seed in STATE_CONTENT_SEED}

    assert prompt_by_state["IDENTIFY"] == first_prompt().content
    for state in ASSISTANT_STATES:
        if state == "CHOOSE_UNIT_OR_ANY":
            rendered = prompt_for(state, {"location_hint": "{location_hint}"})
        else:
            rendered = prompt_for(state)
        assert prompt_by_state[state] == rendered.content


async def test_seed_does_not_change_conversation_engine_read_path(
    db_session: AsyncSession,
) -> None:
    before = prompt_for("CHOOSE_SHIFT")

    await seed_assistant_configuration(db_session)
    await db_session.commit()

    after = prompt_for("CHOOSE_SHIFT")
    assert after.content == before.content
    assert after.quick_replies == before.quick_replies
