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
            "critical_required": [" SQL ", "Power BI"],
            "core_required": ["SQL", "Python"],
            "important": ["Power-BI", "DAX"],
            "nice_to_have": ["", "Python", "SAP"],
        }
    )

    assert result == {
        "critical_required": ["SQL", "Power BI"],
        "core_required": ["Python"],
        "important": ["DAX"],
        "nice_to_have": ["SAP"],
    }


def test_validate_skill_requirements_rejects_invalid_group_type() -> None:
    with pytest.raises(ValueError):
        validate_skill_requirements(
            {
                "critical_required": "SQL",
            }
        )


def test_product_rules_block_more_than_three_critical() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "critical_required": ["SQL", "Python", "ETL", "Power BI"],
            "core_required": ["DAX", "PostgreSQL", "Airflow", "Spark", "dbt", "Excel"],
        },
        job_area="data",
    )

    assert "critical_required não pode ter mais de 3 skills." in result.errors


def test_product_rules_block_critical_above_forty_percent() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "critical_required": ["SQL", "Python"],
            "core_required": ["ETL"],
            "important": ["DAX"],
        },
        job_area="data",
    )

    assert "critical_required não pode representar mais de 40% do total de skills." in result.errors


def test_product_rules_block_soft_skill_as_critical() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "critical_required": ["Comunicação"],
            "core_required": ["SQL", "Python"],
            "important": ["DAX", "ETL"],
            "nice_to_have": ["Power BI"],
        },
        job_area="data",
    )

    assert "Comunicação não pode ser critical_required porque é soft skill." in result.errors


def test_product_rules_block_cross_level_duplicate_when_requested() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "critical_required": ["SQL"],
            "core_required": ["sql", "Python"],
        },
        job_area="data",
        check_raw_duplicates=True,
    )

    assert "SQL não pode aparecer em mais de um nível (critical_required, core_required)." in result.errors


def test_product_rules_remove_empty_values_and_accept_valid_structure() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "critical_required": [" SQL "],
            "core_required": ["Python", "", "Python"],
            "important": ["DAX"],
            "nice_to_have": ["Power BI", " "],
        },
        job_area="data",
    )

    assert result.errors == []
    assert result.sanitized == {
        "critical_required": ["SQL"],
        "core_required": ["Python"],
        "important": ["DAX"],
        "nice_to_have": ["Power BI"],
    }


def test_product_rules_block_missing_core_and_critical() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "important": ["DAX"],
            "nice_to_have": ["Power BI"],
        },
        job_area="data",
    )

    assert "A vaga precisa ter pelo menos 1 skill em core_required ou critical_required." in result.errors


def test_product_rules_block_erp_as_critical_for_data_jobs() -> None:
    result = validate_skill_requirements_product_rules(
        {
            "critical_required": ["SAP"],
            "core_required": ["SQL", "Python", "ETL", "DAX", "Power BI"],
        },
        job_area="data",
    )

    assert (
        "SAP não deve ser critical_required em vaga de dados. Mova para important ou nice_to_have."
        in result.errors
    )
