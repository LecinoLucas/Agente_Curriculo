"""
Tool Registry: Registro centralizado de tools de IA.

Responsável por:
- Armazenar ToolDefinitions com metadados (nome, domínio, permissões, flags).
- Impedir nomes duplicados.
- Resolver tools por nome.
- Listar tools disponíveis.

Não importa banco, repository ou session.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


class ToolNotFoundError(Exception):
    """Raised when a tool name is not found in the registry."""


class ToolAlreadyRegisteredError(Exception):
    """Raised when attempting to register a tool name that already exists."""


@dataclass
class ToolDefinition:
    """Metadados de uma tool de IA.

    Attributes:
        name: Nome único da tool (usado para lookup e execução).
        domain: Domínio de negócio (jobs, candidates, pipeline, admission, protheus).
        description: Descrição curta do que a tool faz.
        required_permissions: Permissões necessárias (AND — todas devem estar presentes).
        read_only: True se a tool é estritamente read-only (sem side effects).
        requires_approval: True se a execução precisa de aprovação humana.
        fn: Função assíncrona que implementa a tool.
    """

    name: str
    domain: str
    description: str
    required_permissions: list[str]
    read_only: bool
    requires_approval: bool
    fn: Callable


class ToolRegistry:
    """Registro centralizado de tools de IA.

    Thread-safe para leitura. Registro ocorre apenas na inicialização.
    Não importa banco, repository ou session.
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        """Registra uma tool.

        Raises:
            ToolAlreadyRegisteredError: Se o nome já existir.
        """
        if tool.name in self._tools:
            raise ToolAlreadyRegisteredError(
                f"Tool '{tool.name}' já registrada no registry."
            )
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDefinition | None:
        """Retorna a tool pelo nome, ou None se não existir."""
        return self._tools.get(name)

    def require(self, name: str) -> ToolDefinition:
        """Retorna a tool pelo nome.

        Raises:
            ToolNotFoundError: Se o nome não existir.
        """
        tool = self._tools.get(name)
        if tool is None:
            raise ToolNotFoundError(f"Tool '{name}' não encontrada no registry.")
        return tool

    def list_tools(self) -> list[ToolDefinition]:
        """Retorna cópia da lista de tools registradas."""
        return list(self._tools.values())

    def list_names(self) -> list[str]:
        """Retorna cópia da lista de nomes registrados."""
        return list(self._tools.keys())

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools
