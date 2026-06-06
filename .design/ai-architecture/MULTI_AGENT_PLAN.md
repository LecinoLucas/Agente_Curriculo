# Plano Multi-Agent: ATS/RH

**Status:** Draft  
**Data:** 2026-06-06  
**Fase:** AI-ARCH-1 (Arquitetura Base)  
**Próxima fase de implementação:** AI-AGENT-1

---

## Visão Geral

O sistema Multi-Agent do ATS/RH opera sob um modelo de **Supervisor → Sub-Agentes** onde:

1. O **Supervisor Agent** recebe a intenção do usuário, decide qual agente especializado acionar e agrega os resultados.
2. **Sub-Agentes especializados** executam tarefas específicas de seu domínio (vagas, candidatos, pipeline, etc.) usando Tools controladas.
3. Nenhum agente age de forma autônoma em ações de escrita. Toda modificação passa por `human-in-the-loop`.

---

## Princípios

- **Read-only primeiro**: Todos os agentes iniciam como read-only. Capacidades de escrita são ativadas incrementalmente com aprovação humana obrigatória.
- **Permissões herdadas**: Cada agente opera com as permissões do usuário que iniciou a sessão (via `AgentContext`).
- **Falha segura**: Em caso de erro, o agente retorna um `ToolResult` com `ok=False` sem tentar recuperação automática perigosa.
- **Observabilidade total**: Cada handoff e tool call é registrado com `request_id`, `session_id` e duração.

---

## Supervisor Agent

**Arquivo:** `src/ai_orchestration/agents/supervisor_agent.py`  
**Status:** Stub (AI-ARCH-1) → Implementar em AI-AGENT-1

### Responsabilidade
- Receber a mensagem do usuário com o `AgentContext`
- Classificar a intenção (intent routing)
- Delegar para o sub-agente especializado correto
- Agregar a resposta e formatar para o usuário
- Solicitar aprovação humana quando um agente sub-especializado indicar `requires_approval=True`

### Capacidades iniciais (read-only)
- Responder perguntas sobre vagas abertas
- Responder perguntas sobre candidatos no pipeline
- Responder perguntas sobre status de processo seletivo
- Consultar base de conhecimento via Knowledge Agent + RAG

### Ações que exigem aprovação humana futura
- Mover candidato de etapa
- Solicitar entrevista
- Acionar fluxo de admissão

### Handoff Map

```
Usuário
  └─► Supervisor Agent
        ├─► Job Agent         (vagas, requisitos, triagem)
        ├─► Candidate Agent   (candidatos, currículos, skills)
        ├─► Pipeline Agent    (etapas, movimentações, status)
        ├─► Admission Agent   (pré-admissão, documentos)
        ├─► Audit Agent       (logs, histórico, auditoria)
        ├─► Knowledge Agent   (políticas, regras, RAG)
        └─► Protheus Agent    (integrações, exportações, status)
```

---

## Job Agent

**Arquivo:** `src/ai_orchestration/agents/job_agent.py`  
**Status:** Stub (AI-ARCH-1)

### Domínio
Vagas, requisitos, rascunhos, configuração de critérios, triagem.

### Tools disponíveis (read-only)
- `get_job_summary(job_id)` — resumo estruturado de uma vaga
- `search_jobs(query, filters)` — busca vagas por critérios

### Tools futuras (write, requer aprovação)
- `update_job_requirements(job_id, changes)` — com diff e confirmação
- `generate_job_draft(input_text)` — já implementado via JobAiDraftService

### Permissões mínimas
- `can_view_jobs`

### Notas
- O `JobAiDraftService` existente **não é alterado** por este agente.
- O Job Agent pode invocar o draft service como Tool, mas não reescreve seu contrato.

---

## Candidate Agent

**Arquivo:** `src/ai_orchestration/agents/candidate_agent.py`  
**Status:** Stub (AI-ARCH-1)

### Domínio
Candidatos, currículos, análise de perfil, skills, score.

### Tools disponíveis (read-only)
- `get_candidate_summary(candidate_id)` — dados principais, skills, score
- `search_candidates(query, job_id, filters)` — busca candidatos por critérios

### Tools futuras (write, requer aprovação)
- `add_note_to_candidate(candidate_id, note)` — com confirmação
- `request_document_from_candidate(candidate_id, doc_type)` — com confirmação

### Permissões mínimas
- `can_view_candidates`

### Notas
- Acesso a dados de candidatos deve respeitar LGPD.
- Agente não deve expor dados sensíveis (CPF, dados de saúde) em respostas conversacionais.

---

## Pipeline Agent

**Arquivo:** `src/ai_orchestration/agents/pipeline_agent.py`  
**Status:** Stub (AI-ARCH-1)

### Domínio
Etapas do processo seletivo, movimentações, status de candidatos por vaga.

### Tools disponíveis (read-only)
- `get_pipeline_status(job_id)` — visão geral do pipeline de uma vaga

### Tools futuras (write, requer aprovação OBRIGATÓRIA)
- `move_candidate_to_stage(candidate_id, job_id, stage_id)` — **sempre exige aprovação humana**
- `reject_candidate(candidate_id, job_id, reason)` — **sempre exige aprovação humana**

### Permissões mínimas
- `can_view_pipeline`

### Notas
- Movimentações no pipeline têm impacto direto no candidato. **Jamais automatizar sem aprovação explícita**.

---

## Admission Agent

**Arquivo:** `src/ai_orchestration/agents/admission_agent.py`  
**Status:** Stub (AI-ARCH-1)

### Domínio
Pré-admissão, documentos, checklist, fluxo de contratação.

### Tools disponíveis (read-only)
- `get_admission_case(candidate_id)` — status do caso de admissão
- `get_pre_admission_documents(admission_id)` — lista de documentos pendentes/aprovados

### Tools futuras (write, requer aprovação OBRIGATÓRIA)
- `send_admission_reminder(admission_id)` — com confirmação
- `approve_document(admission_id, doc_id)` — **aprovação humana obrigatória**

### Permissões mínimas
- `can_view_admissions`

### Notas
- Qualquer ação que altere o status de um processo de admissão **exige aprovação de um usuário com permissão `can_manage_admissions`**.

---

## Audit Agent

**Arquivo:** `src/ai_orchestration/agents/audit_agent.py`  
**Status:** Stub (AI-ARCH-1)

### Domínio
Logs de auditoria, histórico de ações, trilha de alterações.

### Tools disponíveis (read-only, sempre)
- `get_audit_context(entity_type, entity_id, limit)` — histórico de ações sobre uma entidade

### Tools futuras
- Este agente é **permanentemente read-only**. Não existem tools de escrita planejadas.

### Permissões mínimas
- `can_view_audit_logs`

---

## Knowledge Agent

**Arquivo:** `src/ai_orchestration/agents/knowledge_agent.py`  
**Status:** Stub (AI-ARCH-1)

### Domínio
Base de conhecimento interna do RH: políticas, regras, guias, documentação do ATS.

### Tools disponíveis (read-only)
- `search_knowledge(query, source_types)` — consulta RAG sobre documentos internos

### Fontes de conhecimento
- Políticas de RH
- Regras de contratação
- Documentação do ATS
- Documentação de pré-admissão
- Documentação Protheus
- Guias internos
- Critérios de ranking
- Checklist de admissão

### Notas
- **Toda resposta deve incluir citação de fonte** (`RagSource` com `document_id`, `chunk_id`, `title`).
- Não gerar respostas sem evidência na base de conhecimento (ver `RAG_PLAN.md`).

---

## Protheus Agent

**Arquivo:** `src/ai_orchestration/agents/protheus_agent.py`  
**Status:** Stub (AI-ARCH-1)

### Domínio
Integração com Protheus ERP: exportações, status de integração, consultas de contrato.

### Tools disponíveis (read-only)
- `get_protheus_export_status(admission_id)` — status da exportação para o Protheus

### Tools futuras (write, requer aprovação OBRIGATÓRIA)
- `trigger_protheus_export(admission_id)` — **aprovação de gestor obrigatória**

### Permissões mínimas
- `can_view_protheus_status`

### Notas
- O Protheus Agent **nunca executa exportações automaticamente**.
- Qualquer trigger de exportação deve passar por `request_human_approval` e registro em audit log.

---

## Fases de Implementação

| Fase | Descrição | Agentes |
|------|-----------|---------|
| AI-ARCH-1 (atual) | Arquitetura base, contratos, stubs | Todos como stubs |
| AI-AGENT-1 | Supervisor read-only + Job Agent + Knowledge Agent | Supervisor, Job, Knowledge |
| AI-AGENT-2 | Candidate Agent + Pipeline Agent (read-only) | Candidate, Pipeline |
| AI-AGENT-3 | Admission Agent + Audit Agent (read-only) | Admission, Audit |
| AI-AGENT-4 | Protheus Agent (read-only) | Protheus |
| AI-AGENT-5 | Human-in-the-loop para ações de escrita | Todos |

---

## Ações que SEMPRE exigem aprovação humana

Independente de qualquer configuração ou feature flag:

1. Mover candidato de etapa no pipeline
2. Rejeitar candidato
3. Emitir carta de oferta
4. Iniciar processo de pré-admissão
5. Aprovar documentos de pré-admissão
6. Exportar dados para Protheus
7. Alterar dados de vaga publicada
8. Alterar permissões de usuário
9. Deletar qualquer entidade
10. Enviar comunicações para candidatos
