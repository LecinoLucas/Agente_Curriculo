import pytest

from src.application.services.skill_requirements_service import (
    empty_skill_requirements,
    validate_skill_requirements,
    validate_skill_requirements_product_rules,
)


def test_validate_skill_requirements_guarantees_all_levels() -> None:
    assert validate_skill_requirements({}) == empty_skill_requirements()


def test_validate_skill_requirements_removes_duplicates_across_levels() -> None:
    result = validate_skill_requirements(
        {
            "priority": [" SQL ", "Power BI"],
            "complementary": ["Power BI", "DAX"],
            "eliminatory": ["SAP"],
        }
    )

    # Power BI is in both priority and complementary. It should stay in priority because it is processed first.
    assert result == {
        "priority": ["SQL", "Power BI"],
        "complementary": ["DAX"],
        "eliminatory": ["SAP"],
    }


def test_validate_skill_requirements_rejects_invalid_group_type() -> None:
    with pytest.raises(ValueError):
        validate_skill_requirements(
            {
                "priority": "SQL",
            }
        )


def test_validate_skill_requirements_rejects_legacy_levels() -> None:
    with pytest.raises(ValueError, match="unsupported levels: critical_required"):
        validate_skill_requirements(
            {
                "critical_required": ["SQL"],
            }
        )


def test_product_rules_block_more_than_three_eliminatory() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "eliminatory": ["SQL", "Python", "ETL", "Power BI"],
        }
    )

    assert "Critérios eliminatórios de skill não podem ter mais de 3 itens." in result.errors


def test_product_rules_warns_more_than_five_priority() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "priority": ["SQL", "Python", "ETL", "Power BI", "DAX", "PostgreSQL"],
        }
    )

    assert any("Muitas skills essenciais" in w for w in result.warnings)


def test_product_rules_block_soft_skill_as_eliminatory() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "eliminatory": ["Comunicação"],
            "priority": ["SQL", "Python"],
        }
    )

    assert "Comunicação não pode ser eliminatória porque é soft skill." in result.errors


def test_product_rules_block_cross_level_duplicate_when_requested() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "priority": ["SQL"],
            "complementary": ["sql", "Python"],
        },
        check_raw_duplicates=True,
    )

    assert "SQL não pode aparecer em mais de um nível (priority, complementary)." in result.errors


def test_product_rules_remove_empty_values_and_accept_valid_structure() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "priority": [" SQL "],
            "complementary": ["Python", "", "Python"],
            "eliminatory": ["Power BI", " "],
        }
    )

    assert result.errors == []
    assert result.sanitized == {
        "priority": ["SQL"],
        "complementary": ["Python"],
        "eliminatory": ["Power BI"],
    }


def test_product_rules_block_missing_priority_and_eliminatory() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "complementary": ["DAX"],
        }
    )

    assert "A vaga precisa ter pelo menos 1 skill essencial ou eliminatória." in result.errors
