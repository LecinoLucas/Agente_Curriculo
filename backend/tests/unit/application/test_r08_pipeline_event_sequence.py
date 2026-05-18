"""R08 — Pipeline event idempotency key must support legitimate repeats.

Direct unit tests on the pure key builder. Integration test for the full
A→B→A→B flow with a real (SQLite) session goes elsewhere; this file pins the
key format invariants so other IAs can't silently regress them.
"""
from __future__ import annotations

from uuid import UUID

from src.application.services.pipeline_service import _build_event_idempotency_key


def _u(seed: int) -> UUID:
    return UUID(int=seed)


def test_sequence_zero_matches_legacy_format_exactly():
    pid = _u(1)
    actor = _u(2)
    legacy = _build_event_idempotency_key(pid, "stage_moved", "entry", "screening", actor)
    assert legacy == f"pipeline:{pid}:stage_moved:entry:screening:{actor}"


def test_sequence_zero_default_keeps_legacy_format():
    pid = _u(1)
    actor = _u(2)
    explicit = _build_event_idempotency_key(pid, "stage_moved", "entry", "screening", actor, sequence=0)
    default = _build_event_idempotency_key(pid, "stage_moved", "entry", "screening", actor)
    assert explicit == default


def test_sequence_positive_appends_seq_token():
    pid = _u(1)
    actor = _u(2)
    k1 = _build_event_idempotency_key(pid, "stage_moved", "entry", "screening", actor, sequence=1)
    assert k1.endswith(":seq:1")
    k2 = _build_event_idempotency_key(pid, "stage_moved", "entry", "screening", actor, sequence=2)
    assert k2.endswith(":seq:2")
    assert k1 != k2


def test_a_b_a_b_yields_four_distinct_keys():
    """Simulates A→B→A→B by varying (from, to, sequence) like the service would.
    Expectation: 4 distinct keys, so the DB UNIQUE constraint never collides.
    """
    pid = _u(1)
    actor = _u(2)
    # 1st A→B
    k1 = _build_event_idempotency_key(pid, "stage_moved", "screening", "hr_interview", actor, sequence=0)
    # 1st B→A (rollback)
    k2 = _build_event_idempotency_key(pid, "stage_moved", "hr_interview", "screening", actor, sequence=0)
    # 2nd A→B
    k3 = _build_event_idempotency_key(pid, "stage_moved", "screening", "hr_interview", actor, sequence=1)
    # 2nd B→A
    k4 = _build_event_idempotency_key(pid, "stage_moved", "hr_interview", "screening", actor, sequence=1)
    keys = {k1, k2, k3, k4}
    assert len(keys) == 4, f"Expected 4 distinct keys, got {keys}"


def test_null_stages_render_as_token():
    k = _build_event_idempotency_key(_u(1), "candidate_added", None, "entry", _u(2))
    assert ":null:entry:" in k


def test_null_actor_renders_as_token():
    k = _build_event_idempotency_key(_u(1), "stage_moved", "entry", "screening", None)
    assert k.endswith(":null")
