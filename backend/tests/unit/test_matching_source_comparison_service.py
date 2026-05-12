from __future__ import annotations

from dataclasses import replace

from src.application.services.matching_source_comparison_service import (
    MatchingSourcesComparison,
    build_batch_report,
    build_case_notes,
    classify_comparison_case,
    classify_score_delta,
    comparison_to_json_ready,
    _dedupe_mapping_list,
    _extract_equivalence_usage,
)


def test_classify_score_delta_thresholds() -> None:
    assert classify_score_delta(None) == "unavailable"
    assert classify_score_delta(0.0) == "acceptable"
    assert classify_score_delta(2.0) == "acceptable"
    assert classify_score_delta(2.5) == "review"
    assert classify_score_delta(5.0) == "review"
    assert classify_score_delta(5.1) == "block"


def test_extract_equivalence_usage_separates_groups_and_relations() -> None:
    aliases_used, relations_used = _extract_equivalence_usage(
        {
            "skill_evidence_details": [
                {
                    "required": "JavaScript",
                    "candidate": "TypeScript",
                    "match_type": "group",
                    "priority_level": "priority",
                    "coverage": 0.5,
                    "raw_coverage": 0.5,
                    "equivalence_strength": "partial",
                },
                {
                    "required": "Spring",
                    "candidate": "Spring Boot",
                    "match_type": "relation",
                    "priority_level": "priority",
                    "coverage": 0.85,
                    "raw_coverage": 0.85,
                    "equivalence_strength": "strong",
                },
            ]
        }
    )

    assert aliases_used == [
        {
            "required": "JavaScript",
            "candidate": "TypeScript",
            "priority_level": "priority",
            "coverage": 0.5,
            "raw_coverage": 0.5,
            "equivalence_strength": "partial",
            "reason": "",
        }
    ]
    assert relations_used == [
        {
            "required": "Spring",
            "candidate": "Spring Boot",
            "priority_level": "priority",
            "coverage": 0.85,
            "raw_coverage": 0.85,
            "equivalence_strength": "strong",
            "reason": "",
        }
    ]


def test_dedupe_mapping_list_removes_duplicate_dicts() -> None:
    deduped = _dedupe_mapping_list(
        [
            {"required": "Python", "candidate": "Backend"},
            {"candidate": "Backend", "required": "Python"},
        ]
    )

    assert deduped == [{"required": "Python", "candidate": "Backend"}]


def test_comparison_to_json_ready_includes_runs() -> None:
    comparison = MatchingSourcesComparison(
        job_id="job-1",
        job_title="Backend Engineer",
        analysis_id="analysis-1",
        candidate_id="candidate-1",
        candidate_name="Jane Doe",
        resume_version_id="resume-1",
        score_json=80.0,
        score_database=79.5,
        delta_score=-0.5,
        delta_status="acceptable",
        recommendation_json="good_match",
        recommendation_database="good_match",
        reason_codes_json=["domain_fit"],
        reason_codes_database=["domain_fit"],
        reason_codes_diff={"only_json": [], "only_database": []},
        skills_matched_json=["Python"],
        skills_matched_database=["Python"],
        skills_only_json=[],
        skills_only_database=[],
        aliases_used_json=[],
        aliases_used_database=[],
        relations_used_json=[],
        relations_used_database=[],
        partial_matches_json=[],
        partial_matches_database=[],
        source_used_json="json",
        source_used_database="database",
        fallback_occurred=False,
        required_skills_missing_json=[],
        required_skills_missing_database=[],
        required_skills_missing_only_json=[],
        required_skills_missing_only_database=[],
        classification="acceptable",
        notes=[],
        ranking_refresh_status_json="updated",
        ranking_refresh_status_database="updated",
        ranking_warning_json=None,
        ranking_warning_database=None,
    )
    payload = comparison_to_json_ready(comparison)
    assert payload["delta_status"] == "acceptable"


def test_classify_comparison_case_thresholds() -> None:
    assert classify_comparison_case(
        delta_score=0.5,
        score_json=80.0,
        score_database=80.5,
        recommendation_json="good_match",
        recommendation_database="good_match",
        required_skills_missing_only_json=[],
        required_skills_missing_only_database=[],
        fallback_occurred=False,
    ) == "acceptable"
    assert classify_comparison_case(
        delta_score=2.5,
        score_json=80.0,
        score_database=82.5,
        recommendation_json="good_match",
        recommendation_database="good_match",
        required_skills_missing_only_json=[],
        required_skills_missing_only_database=[],
        fallback_occurred=False,
    ) == "review"
    assert classify_comparison_case(
        delta_score=0.5,
        score_json=80.0,
        score_database=80.5,
        recommendation_json="good_match",
        recommendation_database="not_recommended",
        required_skills_missing_only_json=[],
        required_skills_missing_only_database=[],
        fallback_occurred=False,
    ) == "blocked"
    assert classify_comparison_case(
        delta_score=None,
        score_json=None,
        score_database=None,
        recommendation_json="good_match",
        recommendation_database="good_match",
        required_skills_missing_only_json=[],
        required_skills_missing_only_database=[],
        fallback_occurred=False,
    ) == "review"


def test_build_case_notes_mentions_required_skill_and_fallback() -> None:
    notes = build_case_notes(
        delta_score=3.1,
        score_json=80.0,
        score_database=83.1,
        recommendation_json="good_match",
        recommendation_database="good_match",
        skills_only_json=[],
        skills_only_database=["Python"],
        required_skills_missing_only_json=[],
        required_skills_missing_only_database=["SQL"],
        fallback_occurred=True,
    )
    assert "database source fell back to json" in notes
    assert "required skills missing only in database: SQL" in notes
    assert "matched skills only in database: Python" in notes
    assert "score delta above acceptable threshold: 3.1" in notes


def test_build_case_notes_mentions_missing_numeric_score() -> None:
    notes = build_case_notes(
        delta_score=None,
        score_json=None,
        score_database=None,
        recommendation_json="good_match",
        recommendation_database="good_match",
        skills_only_json=[],
        skills_only_database=[],
        required_skills_missing_only_json=[],
        required_skills_missing_only_database=[],
        fallback_occurred=False,
    )
    assert "numeric score unavailable for at least one source" in notes


def test_build_batch_report_aggregates_counts() -> None:
    acceptable = MatchingSourcesComparison(
        job_id="job-1",
        job_title="Job 1",
        analysis_id="analysis-1",
        candidate_id="candidate-1",
        candidate_name="A",
        resume_version_id="resume-1",
        score_json=80.0,
        score_database=81.0,
        delta_score=1.0,
        delta_status="acceptable",
        recommendation_json="good_match",
        recommendation_database="good_match",
        reason_codes_json=[],
        reason_codes_database=[],
        reason_codes_diff={"only_json": [], "only_database": []},
        skills_matched_json=[],
        skills_matched_database=[],
        skills_only_json=[],
        skills_only_database=[],
        required_skills_missing_json=[],
        required_skills_missing_database=[],
        required_skills_missing_only_json=[],
        required_skills_missing_only_database=[],
        aliases_used_json=[],
        aliases_used_database=[],
        relations_used_json=[],
        relations_used_database=[],
        partial_matches_json=[],
        partial_matches_database=[],
        source_used_json="json",
        source_used_database="database",
        fallback_occurred=False,
        classification="acceptable",
        notes=[],
        ranking_refresh_status_json="updated",
        ranking_refresh_status_database="updated",
        ranking_warning_json=None,
        ranking_warning_database=None,
    )
    review = replace(
        acceptable,
        job_id="job-2",
        analysis_id="analysis-2",
        candidate_id="candidate-2",
        candidate_name="B",
        delta_score=3.0,
        delta_status="review",
        required_skills_missing_only_database=["Python"],
        classification="review",
        notes=["required skills missing only in database: Python"],
    )
    blocked = replace(
        acceptable,
        job_id="job-3",
        analysis_id="analysis-3",
        candidate_id="candidate-3",
        candidate_name="C",
        delta_score=6.0,
        delta_status="block",
        recommendation_database="not_recommended",
        fallback_occurred=True,
        classification="blocked",
        notes=["database source fell back to json"],
    )

    report = build_batch_report([acceptable, review, blocked])

    assert report.summary.total_cases == 3
    assert report.summary.acceptable_cases == 1
    assert report.summary.review_cases == 1
    assert report.summary.blocked_cases == 1
    assert report.summary.max_delta == 6.0
    assert report.summary.avg_delta == 3.33
    assert report.summary.changed_recommendations_count == 1
    assert report.summary.fallback_count == 1
    assert report.summary.missing_required_skill_cases == 1
