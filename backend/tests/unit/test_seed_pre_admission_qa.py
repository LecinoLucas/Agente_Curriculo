from scripts.seed_pre_admission_qa import (
    QA_CANDIDATE_EMAIL,
    QA_FAKE_CPF,
    QA_JOB_TITLE,
    build_seed_blueprint,
    validate_seed_blueprint,
)


def test_blueprint_uses_only_fictitious_safe_identifiers() -> None:
    blueprint = build_seed_blueprint()
    candidate = blueprint["candidate"]

    assert candidate["email"] == QA_CANDIDATE_EMAIL
    assert str(candidate["email"]).endswith(".test")
    assert candidate["phone"] is None
    assert candidate["cpf"] == QA_FAKE_CPF
    assert blueprint["job"]["title"] == QA_JOB_TITLE


def test_validate_seed_blueprint_accepts_current_blueprint() -> None:
    blueprint = build_seed_blueprint()
    validate_seed_blueprint(blueprint)


def test_blueprint_package_payload_has_no_sensitive_fields() -> None:
    blueprint = build_seed_blueprint()
    payload = blueprint["package"]["payload_json"]

    for forbidden in ("cpf", "phone", "payload_json", "review_notes", "ocr_text", "raw_text"):
        assert forbidden not in payload
