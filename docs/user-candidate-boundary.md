# User-Candidate Boundary: Formalização da Relação

**Status**: Fase 20.2 - Formalização de acoplamento  
**Data**: 2026-04-28  
**Revisão**: 1.0

---

## 1. DECISÃO ARQUITETURAL FINAL

### Princípios Fundamentais

```
User (Entidade Interna)
├─ Representa: Pessoa com acesso ao sistema ATS
├─ Roles: ADMIN, RECRUITER, VIEWER
├─ Acesso: /pipeline, /admin, /vagas, /analises-ia, /perfil
└─ Sem relacionamento com Candidate por natureza

Candidate (Entidade Externa)
├─ Representa: Pessoa sendo avaliada em processo seletivo
├─ Não requer User associado (normal)
├─ Pode ter user_id opcional (bridge temporal para portal futuro)
└─ Criado por: RECRUITER ou ADMIN

User com role="candidate" (Acesso Portal)
├─ NÃO é usuário interno
├─ Representa: Candidato acessando seu próprio perfil/acompanhamento
├─ user_id em Candidate não implica role="candidate"
├─ role="candidate" SEM Candidate vinculada = erro
└─ Acesso RESTRITO: /perfil + futuras rotas /candidate-portal/*
```

### Garantias

1. **User interno (ADMIN/RECRUITER/VIEWER)**
   - Pode ver ✅: todos candidatos, todas vagas, todos resumes, análises
   - `created_by` no Candidate identifica quem criou

2. **User com role="candidate"**
   - Precisa ter exatamente 1 `Candidate` com `user_id = this_user.id`
   - Pode ver ✅: seu próprio candidate, seus resumes, suas análises
   - Pode fazer: atualizar perfil, fazer upload de resume
   - **Bloqueado** ❌: pipeline, admin, vagas, análises de IA (recruiter)

3. **Candidate sem user_id**
   - É candidato "anônimo" (sourced, imported, etc)
   - Sem login no sistema
   - Gerenciado apenas por recruiter/admin

---

## 2. FIELD DOCUMENTATION

### `Candidate.user_id` (Temporary Bridge)

**Localização:**
```
Backend:
- database/models/candidate_model.py:23
- domain/entities/candidate.py:14
- interface/api/schemas/candidate_schemas.py:27

Frontend:
- types/domain.ts:15
```

**Semântica:**
```python
user_id: Optional[UUID]
# Bridge temporal para portal candidato futuro.
# 
# Semântica:
#   NULL    → Candidate anônimo (sourced, imported)
#   NOT NULL → Candidate com acesso ao portal (user_id referencia User com role="candidate")
#
# Invariantes:
#   - Se user_id NOT NULL → EXISTS User(id=user_id, role="candidate")
#   - Se User(role="candidate") → EXISTS EXACTLY 1 Candidate(user_id=user.id)
#   - Candidate.user_id sempre apontando para User ativo
#
# Nota: Será substituído por CandidateAccount(candidate_id, user_id) em Phase 20.3+
```

**Constraint recomendado:**
```sql
-- Garantir no máximo um candidate por user_id
ALTER TABLE candidates
ADD CONSTRAINT uq_candidates_user_id UNIQUE (user_id) 
WHERE user_id IS NOT NULL;

-- Índice para busca rápida (portal candidato)
CREATE INDEX idx_candidates_user_id 
ON candidates(user_id) 
WHERE user_id IS NOT NULL AND deleted_at IS NULL;
```

---

## 3. ACESSO E PERMISSÕES

### Frontend Routes (AppRouter)

#### ✅ Acessível para role="candidate"
```tsx
/login                                    → PUBLIC
/perfil                                   → Perfil de usuário

FUTURE:
/candidate-portal                         → Dashboard candidato
/candidate-portal/meu-acompanhamento      → Status em vagas
/candidate-portal/meus-curriculos         → Gerenciar resumes
```

#### ❌ Bloqueado para role="candidate"
```tsx
/pipeline                    → RecruiterOrAdmin only
/pipeline/:jobId             → RecruiterOrAdmin only
/candidatos                  → RecruiterOrAdmin only
/vagas                       → RecruiterOrAdmin only
/analises-ia                 → AdminOrRecruiter only
/admin                       → AdminOnly
/admin/usuarios              → AdminOnly
```

### Backend Endpoints (Permissions)

#### CurrentUser (Qualquer role autenticado)
```python
GET    /users/me                 → retorna current_user
GET    /resumes                  → filtra por role (interno = todos, candidate = seus)
POST   /resumes                  → filtra por role
GET    /resumes/:id              → filtra por role
POST   /resumes/:id/upload       → filtra por role
PATCH  /users/me/profile         → atualiza current_user perfil
```

#### RecruiterOrAdmin only
```python
GET    /candidates
POST   /candidates               → created_by = current_user.id
GET    /candidates/:id
GET    /candidates/:id/overview
PATCH  /candidates/:id
GET    /jobs
POST   /jobs
GET    /analyses
```

#### AdminOnly
```python
GET    /users
POST   /users
PATCH  /users/:id
GET    /ai-models
POST   /ai-models
```

---

## 4. IMPLEMENTAÇÃO ATUAL

### Backend - ResumeService (Portal Access Logic)

```python
# File: application/services/resume_service.py

async def list_summaries(self, current_user: User) -> list[dict]:
    """
    Lista resumes filtrado por role do usuário.
    
    Acesso:
    - ADMIN/RECRUITER/VIEWER: todos resumes
    - candidate: apenas seus resumes (via Candidate.user_id)
    
    Portal Candidate Access:
    ────────────────────────
    Se User.role == "candidate":
      1. Busca Candidate onde user_id = current_user.id
      2. Se encontrado → lista resumes desse Candidate
      3. Se NÃO encontrado → erro (estado inválido)
    
    Nota: Esta é a única forma de candidato acessar seus dados no sistema atual.
          Em Phase 20.3+ será migrado para CandidateAccount com autenticação separada.
    """
    if self._can_manage_all(current_user):
        # Acesso interno (recruiter/admin/viewer)
        return await self._repository.list_summaries()
    
    # Portal candidato: find_candidate_by_user_id é bridge temporal
    candidate = await self._repository.find_candidate_by_user_id(current_user.id)
    if candidate is None:
        # User com role="candidate" SEM Candidate vinculada = erro
        raise CandidateNotFoundError("User com role=candidate deve ter Candidate vinculado")
    return await self._repository.list_summaries(candidate.id)
```

### Frontend - AppRouter (Route Protection)

```tsx
// File: app/AppRouter.tsx

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Internal (Protected) */}
        <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          
          {/* Pipeline: INTERNAL ONLY */}
          <Route
            path="pipeline"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                {/* role="candidate" BLOQUEADO aqui */}
                <PipelinePage />
              </ProtectedRoute>
            }
          />

          {/* Candidatos: INTERNAL ONLY */}
          <Route
            path="candidatos"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                {/* role="candidate" BLOQUEADO aqui */}
                <CandidatesPage />
              </ProtectedRoute>
            }
          />

          {/* Vagas: INTERNAL ONLY */}
          <Route
            path="vagas"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                {/* role="candidate" BLOQUEADO aqui */}
                <VagasPage />
              </ProtectedRoute>
            }
          />

          {/* Análises IA: INTERNAL ONLY */}
          <Route
            path="analises-ia"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter"]}>
                {/* role="candidate" BLOQUEADO aqui */}
                <AnalisesIaPage />
              </ProtectedRoute>
            }
          />

          {/* Perfil: TODOS (incluindo candidato) */}
          <Route
            path="perfil"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "candidate", "viewer"]}>
                {/* role="candidate" PERMITIDO: edita seu próprio perfil */}
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Admin: ADMIN ONLY */}
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                {/* role="candidate" BLOQUEADO aqui */}
                <AdminPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
```

---

## 5. EVOLUÇÃO: Phase 20.3+ (Future Portal)

### Migração para CandidateAccount

```
Atual (Phase 20.2):
┌──────────────────────────┐
│ User                     │
│ ├─ id, email, role      │
│ └─ role="candidate"     │
│      ↓ user_id         │
│ Candidate               │
│ ├─ id, full_name       │
│ └─ user_id (FK)        │
└──────────────────────────┘

Futuro (Phase 20.3+):
┌──────────────────────────┐     ┌──────────────────────┐
│ User (Internal)          │     │ CandidateUser        │
│ ├─ id, email, role       │     │ ├─ id, email         │
│ └─ ADMIN/RECRUITER/...   │     │ └─ password_hash     │
└──────────────────────────┘     └──────────────────────┘
                                       ↓ user_id
                                  ┌──────────────────────┐
                                  │ CandidateAccount     │
                                  │ ├─ id, user_id (FK)  │
                                  │ └─ candidate_id (FK) │
                                  └──────────────────────┘
                                       ↓ candidate_id
                                  ┌──────────────────────┐
                                  │ Candidate (External) │
                                  │ ├─ id, full_name     │
                                  │ └─ (sem user_id)     │
                                  └──────────────────────┘
```

**Benefícios da migração:**
- User.role="candidate" é removido
- Candidate.user_id é removido (não mais bridge)
- CandidateUser tem autenticação separada (email/senha diferente)
- Portal candidato é sistema independente

---

## 6. VALIDAÇÕES E TESTES

### Backend Validations

**Role="candidate" precisa ter Candidate:**
```python
# Adicionar em UserAdminService.create()
if user.role == UserRole.CANDIDATE and not body.candidate_id:
    raise ValueError("User com role=candidate requer candidate_id")

# Ou em backend, rejeitar criação de User com role="candidate"
# e obrigar criação via Candidate.user_id
```

**Candidate.user_id deve ser User ativo:**
```python
# Em CandidateService.create()
if body.user_id:
    user = await user_repo.find_by_id(body.user_id)
    if not user or not user.is_active:
        raise ValueError("user_id deve apontar para User ativo")
    if user.role != UserRole.CANDIDATE:
        raise ValueError("user_id deve apontar para User com role=candidate")
```

### Test Cases

```gherkin
Scenario: User com role="candidate" acessa /perfil
  Given um User com role="candidate"
  When acessa GET /perfil
  Then retorna 200 OK com seu próprio perfil
  And NÃO retorna dados de outros users

Scenario: User com role="candidate" acessa /pipeline
  Given um User com role="candidate"
  When acessa GET /pipeline
  Then retorna 403 Forbidden

Scenario: User com role="candidate" lista seus resumes
  Given um User com role="candidate"
  And um Candidate com user_id = this_user.id
  When acessa GET /resumes
  Then retorna apenas resumes desse Candidate
  And NÃO retorna resumes de outros Candidates

Scenario: Candidate sem user_id não pode fazer login
  Given um Candidate criado SEM user_id
  When tenta fazer login no sistema
  Then retorna 401 Unauthorized
  And mensagem: "Este candidato não tem portal de acesso"
```

---

## 7. DOCUMENTAÇÃO DE RISCO

### Riscos Residuais (Controlados)

| Risco | Mitigação | Status |
|-------|-----------|--------|
| User + Candidate desincronizados | Constraint único em user_id | ✅ Mitigado |
| Candidate.user_id sem User | Validação em criar Candidate | ✅ Mitigado |
| Role="candidate" sem Candidate | Validação em criar User | ⚠️ Parcial (sem criar User com role=candidate) |
| Portal candidato é "fantasma" | Documentado aqui + comentários código | ✅ Documentado |

### Recomendações Phase 20.3

1. **NÃO permitir criação de User com role="candidate" via /users**
   - Obrigar criação via Candidate.user_id
   - Ou bloquear completamente até portal estar pronto

2. **Adicionar constraint em banco:**
   ```sql
   ALTER TABLE candidates
   ADD CONSTRAINT check_user_id_implies_candidate
   CHECK (
     user_id IS NULL OR
     EXISTS(SELECT 1 FROM users WHERE users.id = candidates.user_id AND users.role = 'candidate')
   );
   ```

3. **Testes automated:**
   - Suite: `test_candidate_portal_access.py`
   - Validar cada endpoint com `role="candidate"`
   - Validar bloqueios de acesso

---

## 8. REFERÊNCIAS

- **Auditoria anterior**: `/Users/lecinolucas/Desktop/AUDITORIA-USER-CANDIDATE-COUPLING-20260428.md`
- **Código backend**: `/backend/src/application/services/resume_service.py` (lines 62-70)
- **Código frontend**: `/frontend/src/app/AppRouter.tsx` (lines 26-115)
- **Models**: 
  - `/backend/src/infrastructure/database/models/candidate_model.py`
  - `/backend/src/domain/entities/user.py`

---

## Changelog

| Versão | Data | Mudança |
|--------|------|---------|
| 1.0 | 2026-04-28 | Documento inicial - Formalização da relação User-Candidate |

