"""Tests for deal-breaker evaluation logic."""

import pytest
from src.domain.services.deal_breaker_evaluator import evaluate_deal_breakers


class TestLocationField:
    """Test location deal-breaker checks."""

    def test_location_equals_match(self):
        """Location equals and matches."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Must be São Paulo",
                "is_active": True,
            }
        ]
        row = {"location_city": "São Paulo"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_location_equals_not_match(self):
        """Location equals but doesn't match."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Must be São Paulo",
                "is_active": True,
            }
        ]
        row = {"location_city": "Rio de Janeiro"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1
        assert violations[0]["type"] == "deal_breaker"
        assert violations[0]["field"] == "location"

    def test_location_not_equals_match(self):
        """Location not_equals and matches."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "not_equals",
                "value": "Rio de Janeiro",
                "reason": "Cannot be Rio",
                "is_active": True,
            }
        ]
        row = {"location_city": "São Paulo"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_location_not_equals_not_match(self):
        """Location not_equals but doesn't match (violation)."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "not_equals",
                "value": "Rio de Janeiro",
                "reason": "Cannot be Rio",
                "is_active": True,
            }
        ]
        row = {"location_city": "Rio de Janeiro"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1

    def test_location_contains(self):
        """Location contains substring."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "contains",
                "value": "Paulo",
                "reason": "Must contain Paulo",
                "is_active": True,
            }
        ]
        row = {"location_city": "São Paulo"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_location_in_list(self):
        """Location in list of allowed values."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "in",
                "values": ["São Paulo", "Rio de Janeiro", "Belo Horizonte"],
                "reason": "Must be in major cities",
                "is_active": True,
            }
        ]
        row = {"location_city": "São Paulo"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_location_in_list_not_match(self):
        """Location not in list of allowed values."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "in",
                "values": ["São Paulo", "Rio de Janeiro"],
                "reason": "Must be in listed cities",
                "is_active": True,
            }
        ]
        row = {"location_city": "Salvador"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1


class TestExperienceYearsField:
    """Test experience_years deal-breaker checks."""

    def test_experience_gte_sufficient(self):
        """Experience >= required."""
        deal_breakers = [
            {
                "field": "experience_years",
                "operator": ">=",
                "value": "5",
                "reason": "Must have 5+ years",
                "is_active": True,
            }
        ]
        row = {"total_experience_years": 7}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_experience_gte_insufficient(self):
        """Experience < required."""
        deal_breakers = [
            {
                "field": "experience_years",
                "operator": ">=",
                "value": "5",
                "reason": "Must have 5+ years",
                "is_active": True,
            }
        ]
        row = {"total_experience_years": 3}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1
        assert "5" in violations[0]["expected"]

    def test_experience_lte(self):
        """Experience <= required."""
        deal_breakers = [
            {
                "field": "experience_years",
                "operator": "<=",
                "value": "10",
                "reason": "Must not exceed 10 years",
                "is_active": True,
            }
        ]
        row = {"total_experience_years": 8}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_experience_lte_too_much(self):
        """Experience > limit."""
        deal_breakers = [
            {
                "field": "experience_years",
                "operator": "<=",
                "value": "10",
                "reason": "Must not exceed 10 years",
                "is_active": True,
            }
        ]
        row = {"total_experience_years": 15}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1


class TestEducationLevelField:
    """Test education_level deal-breaker checks."""

    def test_education_gte_sufficient(self):
        """Education >= required."""
        deal_breakers = [
            {
                "field": "education_level",
                "operator": ">=",
                "value": "bachelor",
                "reason": "Must have bachelor or higher",
                "is_active": True,
            }
        ]
        row = {"education_level": "master"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_education_gte_insufficient(self):
        """Education < required."""
        deal_breakers = [
            {
                "field": "education_level",
                "operator": ">=",
                "value": "bachelor",
                "reason": "Must have bachelor or higher",
                "is_active": True,
            }
        ]
        row = {"education_level": "high_school"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1

    def test_education_equals(self):
        """Education equals required."""
        deal_breakers = [
            {
                "field": "education_level",
                "operator": "equals",
                "value": "bachelor",
                "reason": "Must have exactly bachelor",
                "is_active": True,
            }
        ]
        row = {"education_level": "bachelor"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0


class TestSkillField:
    """Test skill deal-breaker checks."""

    def test_skill_contains_match(self):
        """Skill contains and matches."""
        deal_breakers = [
            {
                "field": "skill",
                "operator": "contains",
                "value": "Python",
                "reason": "Must have Python",
                "is_active": True,
            }
        ]
        row = {"matched_skills": ["Python", "JavaScript", "SQL"]}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_skill_contains_not_match(self):
        """Skill contains but doesn't match."""
        deal_breakers = [
            {
                "field": "skill",
                "operator": "contains",
                "value": "Python",
                "reason": "Must have Python",
                "is_active": True,
            }
        ]
        row = {"matched_skills": ["JavaScript", "Java"]}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1

    def test_skill_not_contains_match(self):
        """Skill not_contains and matches (candidate doesn't have unwanted skill)."""
        deal_breakers = [
            {
                "field": "skill",
                "operator": "not_contains",
                "value": "PHP",
                "reason": "Cannot have PHP",
                "is_active": True,
            }
        ]
        row = {"matched_skills": ["Python", "JavaScript"]}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_skill_not_contains_violation(self):
        """Skill not_contains but candidate has it (violation)."""
        deal_breakers = [
            {
                "field": "skill",
                "operator": "not_contains",
                "value": "PHP",
                "reason": "Cannot have PHP",
                "is_active": True,
            }
        ]
        row = {"matched_skills": ["PHP", "JavaScript"]}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1


class TestInactiveDeals:
    """Test that inactive deal-breakers are not applied."""

    def test_inactive_deal_breaker_ignored(self):
        """Inactive deal-breaker should not cause violation."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Must be São Paulo",
                "is_active": False,
            }
        ]
        row = {"location_city": "Rio de Janeiro"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_mixed_active_inactive(self):
        """Only active deal-breakers are evaluated."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Must be São Paulo",
                "is_active": False,
            },
            {
                "field": "experience_years",
                "operator": ">=",
                "value": "5",
                "reason": "Must have 5+ years",
                "is_active": True,
            },
        ]
        row = {"location_city": "Rio de Janeiro", "total_experience_years": 3}
        violations = evaluate_deal_breakers(deal_breakers, row)
        # Should only have 1 violation (experience)
        assert len(violations) == 1
        assert violations[0]["field"] == "experience_years"


class TestMultipleDealBreakers:
    """Test multiple deal-breakers on same candidate."""

    def test_multiple_violations(self):
        """Candidate violates multiple deal-breakers."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Must be São Paulo",
                "is_active": True,
            },
            {
                "field": "experience_years",
                "operator": ">=",
                "value": "5",
                "reason": "Must have 5+ years",
                "is_active": True,
            },
        ]
        row = {"location_city": "Rio de Janeiro", "total_experience_years": 2}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 2

    def test_one_violation_out_of_many(self):
        """Candidate violates one of multiple deal-breakers."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Must be São Paulo",
                "is_active": True,
            },
            {
                "field": "experience_years",
                "operator": ">=",
                "value": "5",
                "reason": "Must have 5+ years",
                "is_active": True,
            },
        ]
        row = {"location_city": "São Paulo", "total_experience_years": 2}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1
        assert violations[0]["field"] == "experience_years"


class TestReasonCodeStructure:
    """Test that reason codes have correct structure."""

    def test_reason_code_has_required_fields(self):
        """Reason code includes all required fields."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Custom reason text",
                "is_active": True,
            }
        ]
        row = {"location_city": "Rio de Janeiro"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1

        violation = violations[0]
        assert violation["type"] == "deal_breaker"
        assert violation["field"] == "location"
        assert violation["impact"] == -100.0
        assert "expected" in violation
        assert "actual" in violation
        assert violation["reason"] == "Custom reason text"

    def test_reason_code_shows_expected_actual(self):
        """Reason code shows what was expected vs actual."""
        deal_breakers = [
            {
                "field": "experience_years",
                "operator": ">=",
                "value": "10",
                "reason": "Need experience",
                "is_active": True,
            }
        ]
        row = {"total_experience_years": 5}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1

        violation = violations[0]
        assert "10" in violation["expected"]
        assert "5" in violation["actual"]


class TestEdgeCases:
    """Test edge cases and edge conditions."""

    def test_empty_deal_breakers(self):
        """Empty deal-breakers list."""
        violations = evaluate_deal_breakers([], {"location_city": "São Paulo"})
        assert len(violations) == 0

    def test_none_deal_breakers(self):
        """None deal-breakers."""
        violations = evaluate_deal_breakers(None, {"location_city": "São Paulo"})
        assert len(violations) == 0

    def test_missing_candidate_field(self):
        """Candidate data missing field to check."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Must be São Paulo",
                "is_active": True,
            }
        ]
        row = {}  # No location_city
        violations = evaluate_deal_breakers(deal_breakers, row)
        # Should not cause error, just skip check
        assert len(violations) == 0

    def test_case_insensitive_comparison(self):
        """String comparisons are case-insensitive."""
        deal_breakers = [
            {
                "field": "location",
                "operator": "equals",
                "value": "são paulo",
                "reason": "Must be São Paulo",
                "is_active": True,
            }
        ]
        row = {"location_city": "SÃO PAULO"}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 0

    def test_decimal_experience_values(self):
        """Experience values can be decimals."""
        deal_breakers = [
            {
                "field": "experience_years",
                "operator": ">=",
                "value": "5.5",
                "reason": "Must have 5.5+ years",
                "is_active": True,
            }
        ]
        row = {"total_experience_years": 5.3}
        violations = evaluate_deal_breakers(deal_breakers, row)
        assert len(violations) == 1
