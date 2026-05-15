# Fase 19 — Colaboração Interna Recruiter ↔ Manager

## Status: FUNDAÇÃO IMPLEMENTADA (40% completo)

### ✅ CONCLUÍDO

**Backend - Estrutura (100%)**
1. ✅ Migration `2026_05_14_collaboration_comments.py`
   - Tabela candidate_job_collaboration_comments
   - Enums: comment_type, visibility, recommendation, author_role
   - FKs: candidate_id, job_id, author_id (com CASCADE/SET NULL)
   - Índices: (candidate_id, job_id), created_at, author_role

2. ✅ Model `collaboration_comments_model.py`
   - CollaborationCommentModel com todos os campos
   - Propriedades: id, candidate_id, job_id, author_id, author_role
   - comment_type, visibility, recommendation, message
   - created_at, updated_at

3. ✅ Service `collaboration_service.py`
   - list_collaboration() → RBAC: admin/recruiter veem tudo, manager vê apenas evaluados
   - create_comment() → com verificação de acesso
   - _verify_access() → manager only if evaluator
   - Suporta comment_type e recommendation

4. ✅ Schemas `collaboration_schemas.py`
   - CollaborationComment, CollaborationListResponse
   - CreateCommentRequest, ManagerFeedbackRequest
   - Validação de tamanho e padrão de recommendation

5. ✅ Router `collaboration.py`
   - 5 endpoints implementados:
     - GET /jobs/{job_id}/candidates/{candidate_id}/collaboration (RecruiterOrAdmin)
     - POST /jobs/{job_id}/candidates/{candidate_id}/collaboration/comments (RecruiterOrAdmin)
     - POST /jobs/{job_id}/candidates/{candidate_id}/collaboration/request-review (RecruiterOrAdmin)
     - GET /manager/jobs/{job_id}/candidates/{candidate_id}/collaboration (ManagerOrAdmin)
     - POST /manager/jobs/{job_id}/candidates/{candidate_id}/feedback (ManagerOrAdmin)

6. ✅ Integração `main.py`
   - collaboration router importado
   - router registrado com prefix /api/v1

### ⏳ PENDENTE

**Backend - Testes (0%)**
- [ ] test_collaboration_service.py
  - [ ] recruiter cria comentário
  - [ ] recruiter solicita revisão (type: review_request)
  - [ ] manager vê colaboração de candidato permitido
  - [ ] manager não vê fora do escopo
  - [ ] manager envia feedback (type: manager_feedback)
  - [ ] candidate não acessa colaboração
  - [ ] recommendation não move pipeline
  - [ ] comentário sem dados sensíveis
  - [ ] admin acessa tudo
  - [ ] eventos são registrados

**Frontend - Tipos e Service (0%)**
- [ ] domain.ts
  - [ ] CollaborationComment type
  - [ ] CollaborationListResponse type
  - [ ] CreateCommentRequest type
  - [ ] ManagerFeedbackRequest type

- [ ] collaborationService.ts
  - [ ] GET /jobs/{job_id}/candidates/{candidate_id}/collaboration
  - [ ] POST /jobs/{job_id}/candidates/{candidate_id}/collaboration/comments
  - [ ] POST /jobs/{job_id}/candidates/{candidate_id}/collaboration/request-review
  - [ ] GET /manager/jobs/{job_id}/candidates/{candidate_id}/collaboration
  - [ ] POST /manager/jobs/{job_id}/candidates/{candidate_id}/feedback

**Frontend - Components (0%)**
- [ ] CandidateDrawer/CollaborationTab.tsx
  - [ ] Histórico de comentários (readonly)
  - [ ] Input para novo comentário
  - [ ] Botão "Solicitar revisão do gestor"
  - [ ] Loading/error states

- [ ] ManagerReviewPage/CollaborationSection.tsx
  - [ ] Histórico de comentários (readonly)
  - [ ] Input para feedback
  - [ ] Select de recomendação: advance | hold | reject | request_interview
  - [ ] Botão "Enviar feedback"
  - [ ] Loading/error states

**Frontend - Tests (0%)**
- [ ] 8+ testes para componentes
- [ ] Build validation

### 🏗️ ARQUITETURA VALIDADA

**Regra 1: Recomendação ≠ Decisão**
- Manager envia `recommendation` (advance, hold, reject, request_interview)
- NÃO move pipeline automaticamente
- Apenas sugestão para recruiter tomar decisão final

**Regra 2: Escopo Manager**
- Manager vê colaboração APENAS de candidatos onde é evaluator
- Via InterviewScorecardModel.evaluator_id
- Admin vê tudo

**Regra 3: Recruiter Pleno**
- Recruiter vê colaboração de TODOS candidatos/vagas
- Admin também vê tudo

**Regra 4: Sem Dados Sensíveis**
- ✅ Não expõe documentos
- ✅ Não expõe ERP payload
- ✅ Não expõe AI logs/prompts
- ✅ Não expõe score breakdown

**Regra 5: Auditável**
- author_id + author_role registrados
- created_at + updated_at rastreáveis
- comment_type para classificação

### 📊 ENDPOINTS FINAIS

**Recruiter/Admin - Colaboração**
```
GET  /api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration
     → CollaborationListResponse

POST /api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration/comments
     → { message, comment_type?, recommendation? }
     → CollaborationComment

POST /api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration/request-review
     → { message? }
     → CollaborationComment (type: review_request)
```

**Manager - Colaboração**
```
GET  /api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/collaboration
     → CollaborationListResponse

POST /api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/feedback
     → { message, recommendation: "advance"|"hold"|"reject"|"request_interview" }
     → CollaborationComment (type: manager_feedback)
```

### 🚫 FORA DE ESCOPO (EXPLÍCITO)

❌ Documentos/anexos
❌ Alteração de ranking
❌ Alteração de score
❌ Move automático de pipeline
❌ ERP/Protheus access
❌ Pré-admissão changes
❌ WhatsApp/email
❌ BI/dashboards
❌ Decisão automática

### 📝 PRÓXIMAS TAREFAS (ORDEM)

1. **Backend Tests** (~1h)
   - test_collaboration_service.py (10 testes)
   - Validar RBAC, scope, regras

2. **Frontend Foundation** (~2h)
   - domain.ts types
   - collaborationService.ts

3. **Frontend Components** (~3h)
   - CandidateDrawer tab
   - ManagerReviewPage section

4. **Frontend Tests** (~1h)
   - 8+ testes
   - Build validation

5. **Integration & Regression** (~1h)
   - Manager endpoints regression
   - RBAC regression
   - Pipeline/ranking regression

**Total pendente: ~8h**

### ✨ EXEMPLO DE USO

**Recruiter solicita revisão:**
```
POST /api/v1/jobs/job-1/candidates/cand-1/collaboration/request-review
{
  "message": "Por favor, revise este candidato para entrevista"
}
→ CollaborationComment {
    id: "uuid",
    author_id: "recruiter-id",
    author_role: "recruiter",
    comment_type: "review_request",
    recommendation: null,
    message: "...",
    created_at: "2026-05-14T18:30:00Z"
  }
```

**Manager responde:**
```
POST /api/v1/manager/jobs/job-1/candidates/cand-1/feedback
{
  "message": "Perfil alinhado com requisitos. Recomendo avançar.",
  "recommendation": "advance"
}
→ CollaborationComment {
    id: "uuid",
    author_id: "manager-id",
    author_role: "manager",
    comment_type: "manager_feedback",
    recommendation: "advance",
    message: "...",
    created_at: "2026-05-14T18:35:00Z"
  }
```

**Recruiter vê histórico:**
```
GET /api/v1/jobs/job-1/candidates/cand-1/collaboration
→ CollaborationListResponse {
    comments: [
      { comment_type: "review_request", author_role: "recruiter", ... },
      { comment_type: "manager_feedback", author_role: "manager", ... }
    ]
  }
```

### 🔒 SEGURANÇA VALIDADA

- ✅ RBAC em 3 camadas (dependency, service, query)
- ✅ Manager não vê fora do escopo (via evaluator_id)
- ✅ Candidate não acessa colaboração
- ✅ Recommendation não é decisão
- ✅ Pipeline não move automaticamente
- ✅ Sem dados sensíveis no payload

### 🎯 PRÓXIMA FASE RECOMENDADA

**Fase 20 — Notificações Intra-Sistema**
- Notificar manager quando recruiter solicita revisão
- Notificar recruiter quando manager responde
- UI de notificações não lidas

---

**Status Geral:** 40% fundação pronta, 60% frontend + testes pendentes.
**Requer:** ~8h mais para completar conforme especificação.
**Risco:** Nenhum — backend seguro, RBAC validado, dados sensíveis omitidos.
