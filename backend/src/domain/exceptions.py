class DomainException(Exception):
    """Base para todas as exceções de domínio."""
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class NotFoundException(DomainException):
    """Recurso não encontrado."""


class UnauthorizedException(DomainException):
    """Acesso negado ou credenciais inválidas."""


class ForbiddenException(DomainException):
    """Usuário autenticado mas sem permissão para o recurso."""


class ConflictException(DomainException):
    """Conflito de estado (ex: email duplicado)."""


class ValidationException(DomainException):
    """Dados de entrada inválidos segundo regras de domínio."""


class AccountLockedException(DomainException):
    """Conta bloqueada por excesso de tentativas de login."""


class AccountInactiveException(DomainException):
    """Conta desativada ou pendente de verificação."""
