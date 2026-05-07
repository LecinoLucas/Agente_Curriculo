from src.application.services.skill_normalizer_service import normalize_skill_name


def test_normalize_skill_name_returns_empty_for_none_or_blank() -> None:
    assert normalize_skill_name(None) == ""
    assert normalize_skill_name("") == ""
    assert normalize_skill_name("   ") == ""


def test_normalize_skill_name_removes_accents() -> None:
    assert normalize_skill_name("Análise de Dados") == "analise de dados"


def test_normalize_skill_name_normalizes_hyphen_and_underscore() -> None:
    assert normalize_skill_name(" Power-BI ") == "power bi"
    assert normalize_skill_name("SQL_Server") == "sql server"


def test_normalize_skill_name_preserves_special_skill_characters() -> None:
    assert normalize_skill_name("C#") == "c#"
    assert normalize_skill_name("C++") == "c++"
    assert normalize_skill_name(".NET") == ".net"
