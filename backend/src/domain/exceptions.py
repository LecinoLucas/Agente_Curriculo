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


class InvalidPreAdmissionStatusTransition(ValidationException):
    """Transição de status inválida na pré-admissão."""

    def __init__(
        self,
        *,
        entity: str,
        from_status: str,
        to_status: str,
        allowed_statuses: list[str] | tuple[str, ...] | None = None,
    ) -> None:
        allowed_clause = ""
        if allowed_statuses:
            allowed_clause = " Permitidos: " + ", ".join(allowed_statuses) + "."
        super().__init__(
            f"Transição de status inválida para {entity}: '{from_status}' -> '{to_status}'."
            f"{allowed_clause}"
        )
        self.entity = entity
        self.from_status = from_status
        self.to_status = to_status
        self.allowed_statuses = list(allowed_statuses or [])


class AccountLockedException(DomainException):
    """Conta bloqueada por excesso de tentativas de login."""


class AccountInactiveException(DomainException):
    """Conta desativada ou pendente de verificação."""


class GoogleCalendarConfigError(DomainException):
    """Erro de configuração do Google Calendar."""


class GoogleCalendarAuthError(DomainException):
    """Erro de autenticação no Google Calendar."""


class GoogleCalendarApiError(DomainException):
    """Erro na API do Google Calendar."""


class GoogleCalendarRateLimitError(DomainException):
    """Erro de limite de taxa no Google Calendar."""


class GoogleCalendarDuplicateEventError(DomainException):
    """Tentativa de criar evento duplicado."""


class GoogleCalendarSyncNotAllowedError(DomainException):
    """Sincronização não permitida pela política."""
