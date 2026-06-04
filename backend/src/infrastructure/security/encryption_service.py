from cryptography.fernet import Fernet
from src.core.settings import settings


class EncryptionService:
    """Serviço para criptografia de campos sensíveis (como tokens)."""

    def __init__(self, key: str | None = None):
        key = key or settings.FIELD_ENCRYPTION_KEY
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


class AICredentialEncryptionService(EncryptionService):
    """Criptografia de chaves de provedores IA.

    # [TECNICO: FALLBACK]
    # Usa AI_CREDENTIALS_ENCRYPTION_KEY quando configurada (para isolamento de chaves);
    # caso contrário, reaproveita FIELD_ENCRYPTION_KEY para retrocompatibilidade.
    """

    def __init__(self):
        super().__init__(settings.AI_CREDENTIALS_ENCRYPTION_KEY)


def validate_ai_credentials_encryption_key() -> None:
    try:
        AICredentialEncryptionService()
    except Exception as exc:
        raise ValueError(
            "AI_CREDENTIALS_ENCRYPTION_KEY inválida ou ausente. "
            "Configure uma chave Fernet válida ou FIELD_ENCRYPTION_KEY conforme a política do projeto."
        ) from exc
