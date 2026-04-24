from datetime import datetime, timezone

import pytest

from src.domain.entities.user import User, UserRole, UserStatus


def test_create_user_sets_defaults():
    user = User.create(email="Ana@Test.com", password_hash="hash", full_name="Ana Silva")
    assert user.email == "ana@test.com"          # normaliza lowercase
    assert user.full_name == "Ana Silva"
    assert user.role == UserRole.CANDIDATE
    assert user.status == UserStatus.PENDING_VERIFICATION
    assert user.login_count == 0
    assert user.is_active is False               # pending_verification ≠ active


def test_verify_email_activates_user():
    user = User.create(email="test@test.com", password_hash="hash", full_name="Test")
    user.verify_email()
    assert user.status == UserStatus.ACTIVE
    assert user.email_verified_at is not None
    assert user.is_active is True


def test_record_failed_login_increments_counter():
    user = User.create(email="test@test.com", password_hash="hash", full_name="Test")
    user.verify_email()
    user.record_failed_login()
    user.record_failed_login()
    assert user.failed_login_count == 2


def test_successful_login_resets_failed_counter():
    user = User.create(email="test@test.com", password_hash="hash", full_name="Test")
    user.verify_email()
    user.record_failed_login()
    user.record_successful_login()
    assert user.failed_login_count == 0
    assert user.login_count == 1
    assert user.last_login_at is not None


def test_soft_delete():
    user = User.create(email="test@test.com", password_hash="hash", full_name="Test")
    user.verify_email()
    assert user.is_deleted is False
    user.soft_delete()
    assert user.is_deleted is True
    assert user.is_active is False
