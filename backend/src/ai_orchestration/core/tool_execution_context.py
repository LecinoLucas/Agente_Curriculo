"""
Tool Execution Context: Contexto de execução para tools de IA.

Agrega AgentContext do usuário e services disponíveis para injeção.
O ToolRuntime usa este contexto para injetar dependencies nas tools
por correspondência de nome de parâmetro.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.ai_orchestration.core.agent_context import AgentContext


@dataclass
class ToolExecutionContext:
    """Contexto completo para execução de uma tool.

    Attributes:
        agent_context: Contexto do agente com permissões e identificadores.
        services: Mapa de nome_de_parâmetro → instância de service.
            O runtime usa este mapa para injetar dependencies nas tools
            por correspondência de nome de parâmetro da função.
            Exemplo: {"job_service": job_svc, "candidate_service": cand_svc}
        read_only: Modo de execução. True indica que apenas tools read-only
            sem requires_approval devem ser executadas.
    """

    agent_context: AgentContext
    services: dict[str, Any] = field(default_factory=dict)
    read_only: bool = True
