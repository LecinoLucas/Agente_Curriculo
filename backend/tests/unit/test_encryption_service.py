import pytest
from cryptography.fernet import Fernet
from src.infrastructure.security.encryption_service import EncryptionService
from src.core.settings import settings


def test_encryption_service_encrypt_decrypt():
    """Testa que encrypt e decrypt funcionam corretamente."""
    service = EncryptionService()
    original = "secret_token_123"
    
    # Encrypt
    encrypted = service.encrypt(original)
    assert encrypted != original
    assert len(encrypted) > len(original)
    
    # Decrypt
    decrypted = service.decrypt(encrypted)
    assert decrypted == original


def test_encryption_service_empty_values():
    """Testa comportamento com valores vazios."""
    service = EncryptionService()
    
    assert service.encrypt("") == ""
    assert service.encrypt(None) == ""
    
    assert service.decrypt("") == ""
    assert service.decrypt(None) == ""


def test_encryption_service_invalid_key_error():
    """Testa que falha se a chave for inválida para o Fernet."""
    # Alterar temporariamente a chave para uma inválida
    original_key = settings.FIELD_ENCRYPTION_KEY
    settings.FIELD_ENCRYPTION_KEY = "invalid_key"
    
    with pytest.raises(Exception):
        EncryptionService()
        
    # Restaurar
    settings.FIELD_ENCRYPTION_KEY = original_key
