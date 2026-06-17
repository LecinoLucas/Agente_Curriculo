"""
Supervisor Agent: Roteador principal de intenções do assistente ATS/RH.

STATUS: STUB — AI-ARCH-1
Implementação real: AI-AGENT-1

Nota de consolidação:
    Este módulo está atualmente sem referências de runtime/roteador/testes do
    bot de candidato. Ainda assim ele foi mantido porque serve como marcador
    explícito da arquitetura futura em LangGraph e evita perder o ponto de
    ancoragem planejado para AI-AGENT-1.

Responsabilidade:
    - Receber mensagem do usuário com AgentContext
    - Classificar a intenção (intent routing)
    - Delegar para o sub-agente especializado correto
    - Agregar resposta e formatar para o usuário
    - Solicitar aprovação humana se qualquer tool indicar requires_approval=True

Agentes disponíveis para delegação:
    - JobAgent (vagas, triagem)
    - CandidateAgent (candidatos, currículos)
    - PipelineAgent (pipeline, etapas)
    - AdmissionAgent (pré-admissão, documentos)
    - AuditAgent (logs, histórico)
    - KnowledgeAgent (políticas, RAG)
    - ProtheusAgent (ERP, exportações)

Fases de implementação:
    AI-AGENT-1: Supervisor read-only + JobAgent + KnowledgeAgent
    AI-AGENT-2: CandidateAgent + PipelineAgent
    AI-AGENT-3: AdmissionAgent + AuditAgent
    AI-AGENT-4: ProtheusAgent
    AI-AGENT-5: Human-in-the-loop para ações de escrita
"""
# TODO: AI-AGENT-1 — Implementar SupervisorAgent com LangGraph
