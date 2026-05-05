from decimal import Decimal

from src.application.services.match_confidence_service import compute_match_confidence


def test_match_confidence_is_high_for_well_structured_job_and_candidate() -> None:
    assessment = compute_match_confidence(
        match_score=87,
        structured_mandatory_skill_count=3,
        structured_total_skill_count=5,
        has_job_seniority=True,
        has_job_min_experience=True,
        candidate_structured_skill_count=4,
        candidate_has_experience=True,
        candidate_has_education=True,
    )

    assert assessment.confidence_score == Decimal("100.00")
    assert assessment.low_confidence_alert is False
    assert assessment.overestimation_risks == ()


def test_match_confidence_is_low_when_job_has_no_structured_skills() -> None:
    assessment = compute_match_confidence(
        match_score=72,
        structured_mandatory_skill_count=0,
        structured_total_skill_count=0,
        has_job_seniority=True,
        has_job_min_experience=True,
        candidate_structured_skill_count=3,
        candidate_has_experience=True,
        candidate_has_education=True,
    )

    assert assessment.confidence_score == Decimal("45.00")
    assert assessment.low_confidence_alert is True
    assert any("skills obrigatórias estruturadas" in risk for risk in assessment.overestimation_risks)


def test_match_confidence_drops_when_candidate_lacks_experience_and_education() -> None:
    assessment = compute_match_confidence(
        match_score=58,
        structured_mandatory_skill_count=2,
        structured_total_skill_count=3,
        has_job_seniority=True,
        has_job_min_experience=True,
        candidate_structured_skill_count=2,
        candidate_has_experience=False,
        candidate_has_education=False,
    )

    assert assessment.confidence_score == Decimal("60.00")
    assert assessment.low_confidence_alert is False


def test_match_confidence_flags_high_score_with_low_data_quality() -> None:
    assessment = compute_match_confidence(
        match_score=83,
        structured_mandatory_skill_count=0,
        structured_total_skill_count=0,
        has_job_seniority=True,
        has_job_min_experience=False,
        candidate_structured_skill_count=0,
        candidate_has_experience=True,
        candidate_has_education=False,
        used_job_skill_fallback=True,
    )

    assert assessment.confidence_score == Decimal("15.00")
    assert assessment.low_confidence_alert is True
    assert any("Score alto com baixa confiança" in risk for risk in assessment.overestimation_risks)
