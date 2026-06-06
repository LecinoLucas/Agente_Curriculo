"""
Candidate Agent: Agente especializado em candidatos, currículos e scores.

STATUS: STUB — AI-ARCH-1
Implementação real: AI-AGENT-2

Capacidades read-only (fase inicial):
    - Resumo de perfil de candidato (sem dados sensíveis)
    - Busca de candidatos por critérios dentro de uma vaga
    - Explicação do score e match de um candidato

Tools disponíveis:
    - get_candidate_summary(candidate_id) — permissão: can_view_candidates
    - search_candidates(query, job_id, filters) — permissão: can_view_candidates

Restrições LGPD obrigatórias:
    - CPF, dados de saúde e bancários são OMITIDOS de todas as respostas
    - Agente não deve reproduzir dados sensíveis em respostas conversacionais

Fases de implementação:
    AI-AGENT-2: Implementar CandidateAgent com tools read-only
"""
# TODO: AI-AGENT-2 — Implementar CandidateAgent
