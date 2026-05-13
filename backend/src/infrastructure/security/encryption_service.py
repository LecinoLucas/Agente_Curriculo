from cryptography.fernet import Fernet
from src.core.settings import settings


class EncryptionService:
    """Serviço para criptografia de campos sensíveis (como tokens)."""

    def __init__(self):
        key = settings.FIELD_ENCRYPTION_KEY
        if not key:
            raise ValueError("FIELD_ENCRYPTION_KEY não configurada")
        self.fernet = Fernet(key.encode())

    def encrypt(self, value: str | None) -> str:
        """Criptografa uma string."""
        if value is None or value == "":
            return ""
        return self.fernet.encrypt(value.encode()).decode()

    def decrypt(self, value: str | None) -> str:
        """Descriptografa uma string."""
        if value is None or value == "":
            return ""
        try:
            return self.fernet.decrypt(value.encode()).decode()
        except Exception as e:
            raise ValueError("Falha ao descriptografar valor") from e
