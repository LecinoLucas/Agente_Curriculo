"""R07 — Idempotency key v1 must:
1. Be deterministic for the same inputs (idempotent).
2. Be unique across 1000+ distinct input combinations.
3. Distinguish requesters (new field) and jobs (existing field).
4. Stay under VARCHAR(255).
5. Not collide with the legacy format.
"""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.domain.services.analysis_versioning import AnalysisVersioningService


def _u(seed: int) -> UUID:
    # Deterministic UUIDs for reproducible tests.
    return UUID(int=seed)


def test_same_inputs_yield_same_key():
    rv, pt, am, job, req = _u(1), _u(2), _u(3), _u(4), _u(5)
    k1 = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=job, requested_by=req)
    k2 = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=job, requested_by=req)
    assert k1 == k2


def test_different_job_yields_different_key():
    rv, pt, am, req = _u(1), _u(2), _u(3), _u(5)
    k1 = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=_u(10), requested_by=req)
    k2 = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=_u(11), requested_by=req)
    assert k1 != k2


def test_different_requester_yields_different_key():
    rv, pt, am, job = _u(1), _u(2), _u(3), _u(4)
    k_alice = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=job, requested_by=_u(100))
    k_bob = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=job, requested_by=_u(101))
    assert k_alice != k_bob


def test_different_model_yields_different_key():
    rv, pt, job, req = _u(1), _u(2), _u(4), _u(5)
    k1 = AnalysisVersioningService.build_idempotency_key(rv, pt, _u(30), job_id=job, requested_by=req)
    k2 = AnalysisVersioningService.build_idempotency_key(rv, pt, _u(31), job_id=job, requested_by=req)
    assert k1 != k2


def test_different_prompt_template_yields_different_key():
    rv, am, job, req = _u(1), _u(3), _u(4), _u(5)
    k1 = AnalysisVersioningService.build_idempotency_key(rv, _u(20), am, job_id=job, requested_by=req)
    k2 = AnalysisVersioningService.build_idempotency_key(rv, _u(21), am, job_id=job, requested_by=req)
    assert k1 != k2


def test_different_resume_version_yields_different_key():
    pt, am, job, req = _u(2), _u(3), _u(4), _u(5)
    k1 = AnalysisVersioningService.build_idempotency_key(_u(40), pt, am, job_id=job, requested_by=req)
    k2 = AnalysisVersioningService.build_idempotency_key(_u(41), pt, am, job_id=job, requested_by=req)
    assert k1 != k2


def test_null_job_is_stable_token_not_random():
    rv, pt, am, req = _u(1), _u(2), _u(3), _u(5)
    k1 = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=None, requested_by=req)
    k2 = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=None, requested_by=req)
    assert k1 == k2
    assert ":null:" in k1


def test_null_requester_is_stable_system_token():
    rv, pt, am, job = _u(1), _u(2), _u(3), _u(4)
    k1 = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=job, requested_by=None)
    k2 = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=job, requested_by=None)
    assert k1 == k2
    assert k1.endswith(":system")


def test_key_starts_with_versioned_namespace():
    k = AnalysisVersioningService.build_idempotency_key(
        _u(1), _u(2), _u(3), job_id=_u(4), requested_by=_u(5)
    )
    assert k.startswith("analysis:v1:")


def test_key_fits_within_varchar_255():
    k = AnalysisVersioningService.build_idempotency_key(
        _u(1), _u(2), _u(3), job_id=_u(4), requested_by=_u(5)
    )
    assert len(k) < 255


def test_v1_does_not_collide_with_legacy_format():
    # Legacy = "analysis:{rv}:{pt}:{am}:{job_or_generic}" — no `v1` token.
    rv, pt, am, job = _u(1), _u(2), _u(3), _u(4)
    new = AnalysisVersioningService.build_idempotency_key(rv, pt, am, job_id=job, requested_by=_u(5))
    legacy = AnalysisVersioningService.build_idempotency_key_legacy(rv, pt, am, job_id=job)
    assert new != legacy
    assert ":v1:" in new
    assert ":v1:" not in legacy


def test_1000_distinct_combinations_no_collision():
    seen: set[str] = set()
    for i in range(1000):
        rv = _u(1000 + i)
        pt = _u(2000 + (i % 7))
        am = _u(3000 + (i % 5))
        job = _u(4000 + (i % 13)) if (i % 3) != 0 else None
        req = _u(5000 + (i % 17))
        key = AnalysisVersioningService.build_idempotency_key(
            rv, pt, am, job_id=job, requested_by=req
        )
        assert key not in seen, f"Collision at i={i}: {key}"
        seen.add(key)
    assert len(seen) == 1000
