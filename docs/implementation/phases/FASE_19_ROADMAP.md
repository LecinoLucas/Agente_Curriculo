# Fase 19 — Colaboração Interna Recruiter ↔ Manager

## Status: EM PROGRESSO

### Componentes Iniciados

✅ **Backend - Estrutura**
1. Migration `2026_05_14_collaboration_comments.py` — CRIADA
   - Tabela candidate_job_collaboration_comments com enums
   - Índices para performance
   - FKs com ondelete CASCADE/SET NULL

2. Model `collaboration_comments_model.py` — CRIADO
   - CollaborationCommentModel com todos os campos
   - Pronto para integração ORM

3. Service `collaboration_service.py` — CRIADO
   - list_collaboration() com RBAC
   - create_comment() com acesso verificado
   - _verify_access() para manager/recruiter/admin
   - Regras: manager só vê candidatos que avalia

### Componentes Pendentes (Ordem de Implementação)

#### Backend — Camada de API (~4h)
- [ ] Schemas: CollaborationCommentResponse, CreateCommentRequest
- [ ] Router: POST/GET /api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration
- [ ] Router: POST /api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration/request-review
- [ ] Manager Router: GET /api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/collaboration
- [ ] Manager Router: POST /api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/feedback
- [ ] Tests: 10 testes backend (RBAC, scope, regras)

#### Frontend — Tipos e Service (~2h)
- [ ] domain.ts: CollaborationComment, CollaborationResponse types
- [ ] collaborationService.ts: API client (3 endpoints)
- [ ] types/index.ts: exports

#### Frontend — Components (~4h)
- [ ] CandidateDrawer: nova aba "Colaboração"
  - Histórico de comentários
  - Botão "Solicitar revisão do gestor"
  - Campo de comentário
  - Loading/error states
- [ ] ManagerReviewPage: seção de colaboração
  - Bloco de comentários
  - Campo de feedback
  - Select de recomendação (advance, hold, reject, interview)
  - Visualização como sugestão, não decisão

#### Testes (~3h)
- [ ] Backend: test_collaboration_service.py (10 testes)
  - Recruiter cria comentário
  - Solicita revisão
  - Manager vê candidatos do escopo
  - Manager não vê fora do escopo
  - Recommendation não move pipeline
  - Sem acesso ao candidate
  - Admin acessa tudo
- [ ] Frontend: 8 testes de componentes
  - Rendering
  - Interação
  - Loading/error states
  - Build validation

## Arquitetura de Decisão

### Regra 1: Recomendação ≠ Decisão
Manager envia `recommendation` (advance, hold, reject, interview).
**NÃO move pipeline.** Apenas sugestão para recruiter.
Recruiter toma decisão final via hiring_decision ou pipeline move.

### Regra 2: Escopo Manager
Manager vê colaboração SOMENTE para candidatos onde é evaluator
(InterviewScorecardModel.evaluator_id == manager.user_id).

### Regra 3: Recruiter Pleno
Recruiter vê colaboração de TODOS os candidatos em TODAS as vagas.

### Regra 4: Sem Dados Sensíveis
Colaboração não expõe:
- Documentos
- ERP payload
- AI logs/prompts
- Score breakdown
- Dados pessoais (CPF, RG)

### Regra 5: Auditável
Toda criação/update registra:
- author_id + author_role
- created_at + updated_at
- comment_type para classificação

## Endpoints Finais

### Recruiter/Admin - Colaboração
```
GET  /api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration
     → CollaborationListResponse { comments: CollaborationComment[] }

POST /api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration/comments
     → { comment_type, message, recommendation? }
     → CollaborationComment

POST /api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration/request-review
     → { message? }
     → CollaborationComment (type: review_request)
```

### Manager - Colaboração
```
GET  /api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/collaboration
     → CollaborationListResponse

POST /api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/feedback
     → { message, recommendation: "advance"|"hold"|"reject"|"request_interview" }
     → CollaborationComment (type: manager_feedback)
```

## Estados da UI

### CandidateDrawer - Aba Colaboração
```
[Loading...]
  ↓
[Histórico]
- comentário 1 (recruiter, 10 mai)
- comentário 2 (manager, 9 mai)
  ↓
[Input novo comentário]
[Solicitar revisão do gestor] btn
  ↓
[Error message] (se falhar)
```

### ManagerReviewPage - Bloco Colaboração
```
[Colaboração]
- histórico (readonly)
  ↓
[Meu feedback]
[Textarea: sua análise]
[Select: Recomendação]
  [○] Avançar
  [○] Segurar
  [○] Reprovar
  [○] Solicitar entrevista
[Enviar] btn
```

## Fora de Escopo (Explícito)

❌ Documentos/anexos
❌ Alteração de ranking
❌ Alteração de score
❌ Move automático de pipeline
❌ ERP/Protheus access
❌ Pré-admissão changes
❌ WhatsApp/email
❌ BI/dashboards
❌ Decisão automática

## Próximas Fases (Sugeridas)

### Fase 20 — Notificações Intra-Sistema
- Notificar manager quando recruiter solicita revisão
- Notificar recruiter quando manager responde
- Histórico de notificações
- Preferências de notificação

### Fase 21 — Automação Leve
- Template de análises rápidas para manager
- Quick actions (Avançar, Reprovar, Solicitar entrevista)
- Bulk feedback para múltiplos candidatos

### Fase 22 — Relatórios
- Tempo médio de revisão por gestor
- Taxa de concordância recruiter/gestor
- Histórico de recomendações vs. decisões finais

## Checklist de Implementação

- [ ] Migration aplicada e testada
- [ ] Models criados e integrados
- [ ] Service com RBAC validado
- [ ] Endpoints implementados
- [ ] Schemas Pydantic criados
- [ ] Router registrado em main.py
- [ ] Backend tests passando
- [ ] Frontend types criados
- [ ] Frontend service criado
- [ ] CandidateDrawer atualizado
- [ ] ManagerReviewPage atualizado
- [ ] Frontend tests passando
- [ ] npm run build SUCCESS
- [ ] Regression tests passando (pipeline, ranking, score)
- [ ] Code review completado
- [ ] Documentação atualizada

## Tempo Estimado

- Backend structure: ✅ 30min
- Backend API: ~2h
- Frontend: ~4h
- Tests: ~3h
- **Total: ~9h**

---

**Próximo passo:** Criar schemas Pydantic e router para colaboração.
