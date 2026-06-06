"""
Job Agent: Agente especializado em vagas, requisitos e triagem.

STATUS: STUB — AI-ARCH-1
Implementação real: AI-AGENT-1

Capacidades read-only (fase inicial):
    - Responder perguntas sobre vagas abertas
    - Explicar requisitos e critérios de uma vaga
    - Listar vagas por área, status ou seniority
    - Indicar quantidade de candidatos em uma vaga

Tools disponíveis:
    - get_job_summary(job_id) — permissão: can_view_jobs
    - search_jobs(query, filters) — permissão: can_view_jobs

Integração com JobAiDraftService:
    - O Job Agent NÃO altera o JobAiDraftService existente.
    - Pode invocar o draft service como Tool futura, mas não reescreve seu contrato.

Fases de implementação:
    AI-AGENT-1: Implementar JobAgent com tools read-only
"""
# TODO: AI-AGENT-1 — Implementar JobAgent
