from decimal import Decimal
from uuid import uuid4

from src.domain.entities.analysis import SeniorityLevel
from src.domain.services.business_rules_engine import (
    AnalysisLevel,
    BusinessRulesEngine,
)
from src.domain.services.job_compatibility_calculator import CompatibilityInput
from src.domain.services.score_calculator import ExtractedResumeData
from src.domain.services.seniority_classifier import SeniorityInput
from src.domain.value_objects.skill_set import RequiredSkill, SkillEntry, SkillSet


def _sample_resume_data() -> ExtractedResumeData:
    return ExtractedResumeData(
        total_experience_months=84,
        experiences=[
            {"company": "A", "role": "Backend Engineer", "duration_months": 30, "is_leadership": False},
            {"company": "B", "role": "Tech Lead", "duration_months": 54, "is_leadership": True},
        ],
        employment_gaps=[{"duration_months": 3}],
        skills=[
            {"name": "Python", "proficiency_level": "expert", "years_experience": 7},
            {"name": "FastAPI", "proficiency_level": "advanced", "years_experience": 5},
            {"name": "PostgreSQL", "proficiency_level": "advanced", "years_experience": 6},
            {"name": "Redis", "proficiency_level": "intermediate", "years_experience": 4},
        ],
        skill_categories=["backend", "database", "infra", "api"],
        highest_education_level="bachelor",
        education_field_relevance="high",
        certifications=[{"name": "AWS SAA"}, {"name": "CKA"}],
        communication_quality={
            "structure": 85,
            "clarity": 88,
            "professionalism": 90,
            "completeness": 82,
        },
        leadership_indicators={
            "has_management": True,
            "has_project_lead": True,
            "has_mentoring": True,
            "has_cross_team": True,
        },
    )


def _sample_seniority_input() -> SeniorityInput:
    return SeniorityInput(
        total_experience_months=84,
        roles_text="senior backend engineer tech lead engineering manager",
        has_management_experience=True,
        has_project_leadership=True,
        average_skill_proficiency=3.5,
        explicit_level="lead",
    )


def test_resume_rules_produce_score_level_and_audit() -> None:
    engine = BusinessRulesEngine()

    result = engine.evaluate_resume(
        extracted_data=_sample_resume_data(),
        seniority_input=_sample_seniority_input(),
    )

    assert float(result.breakdown.overall.value) > 0
    assert result.analysis_level in {
        AnalysisLevel.ELITE,
        AnalysisLevel.STRONG,
        AnalysisLevel.SOLID,
        AnalysisLevel.DEVELOPING,
        AnalysisLevel.RISK,
    }
    assert result.seniority.level in {
        SeniorityLevel.SENIOR,
        SeniorityLevel.LEAD,
        SeniorityLevel.PRINCIPAL,
    }
    assert result.audit.flow == "resume_rules"
    assert result.audit.ruleset_version == BusinessRulesEngine.RULESET_VERSION
    assert len(result.audit.input_checksum) == 64
    assert any("overall_score=" in step for step in result.audit.decision_trace)


def test_compatibility_rules_return_recommendation_and_trace() -> None:
    engine = BusinessRulesEngine()

    python_skill_id = uuid4()
    sql_skill_id = uuid4()

    candidate_skills = SkillSet.from_list(
        [
            SkillEntry(
                skill_id=python_skill_id,
                skill_name="Python",
                normalized_name="python",
                proficiency_level="expert",
                is_primary=True,
            ),
            SkillEntry(
                skill_id=sql_skill_id,
                skill_name="SQL",
                normalized_name="sql",
                proficiency_level="advanced",
            ),
        ]
    )

    required_skills = [
        RequiredSkill(
            skill_id=python_skill_id,
            skill_name="Python",
            normalized_name="python",
            is_mandatory=True,
            minimum_level="advanced",
            weight=Decimal("2.0"),
        ),
        RequiredSkill(
            skill_id=sql_skill_id,
            skill_name="SQL",
            normalized_name="sql",
            is_mandatory=False,
            minimum_level="intermediate",
            weight=Decimal("1.0"),
        ),
    ]

    result = engine.evaluate_compatibility(
        CompatibilityInput(
            candidate_skills=candidate_skills,
            required_skills=required_skills,
            candidate_seniority=SeniorityLevel.SENIOR,
            candidate_experience_years=8.0,
            candidate_education_level="bachelor",
            job_seniority=SeniorityLevel.SENIOR,
            job_min_experience_years=5.0,
            job_min_education_level="bachelor",
        )
    )

    assert float(result.compatibility.match_score.value) >= 65
    assert result.compatibility.recommendation in {
        "strong_match",
        "good_match",
        "potential",
        "not_recommended",
    }
    assert result.audit.flow == "job_compatibility_rules"
    assert any("recommendation=" in step for step in result.audit.decision_trace)


def test_versioning_rules_detect_significant_regression() -> None:
    engine = BusinessRulesEngine()

    previous = {
        "overall_score": Decimal("82.00"),
        "technical_score": Decimal("84.00"),
        "experience_score": Decimal("80.00"),
        "education_score": Decimal("70.00"),
        "communication_score": Decimal("88.00"),
        "leadership_score": Decimal("73.00"),
    }
    current = {
        "overall_score": Decimal("63.00"),
        "technical_score": Decimal("66.00"),
        "experience_score": Decimal("61.00"),
        "education_score": Decimal("68.00"),
        "communication_score": Decimal("74.00"),
        "leadership_score": Decimal("60.00"),
    }

    result = engine.evaluate_versioning(previous_scores=previous, new_scores=current)

    assert float(result.delta.overall) == -19.0
    assert result.delta.is_significant is True
    assert result.should_alert is True
    assert result.audit.flow == "analysis_versioning_rules"
    assert any("delta_overall=" in step for step in result.audit.decision_trace)
