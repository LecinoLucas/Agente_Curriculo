# Public Candidate API Contract — C2

## Objetivo

Consolidar e padronizar todos os endpoints públicos do candidato sob o prefixo
`/api/v1/public/*`, criando aliases/fachadas compatíveis sem remover nem alterar
os endpoints existentes. Esta fase prepara o contrato oficial para integração
futura do `candidate-portal/` app.

---

## Endpoints oficiais

### 1. Vagas públicas

| Método | Path | Auth | Novo em C2? |
|--------|------|------|-------------|
| `GET` | `/api/v1/public/jobs` | Público | Não (já existia) |
| `GET` | `/api/v1/public/jobs/{job_id}` | Público | **Sim** |

#### `GET /api/v1/public/jobs/{job_id}`
- Aceita `job_id` (UUID).
- Retorna apenas vagas com `status=published` e `deleted_at IS NULL`.
- Response: `PublicJobDetailResponse` — campos públicos apenas.
- 404 se a vaga não for encontrada ou não estiver publicada.

#### Campos retornados (`PublicJobDetailResponse`)
```
id, title, description, requirements, responsibilities,
location, job_area, work_model, seniority_level,
benefits, working_hours, published_at
```

> **Nota**: Não há campo `slug` no banco de dados. O identificador público é o UUID.
> Se slug for necessário em fase futura, deve ser adicionado via migration.

---

### 2. Inscrição pública

| Método | Path | Auth | Novo em C2? |
|--------|------|------|-------------|
| `GET`  | `/api/v1/public/candidates/check-exists` | Rate-limit IP | Não |
| `POST` | `/api/v1/public/candidates/apply` | Rate-limit IP | Não |

---

### 3. Autenticação — aliases oficiais

| Método | Path | Auth | Alias de | Novo em C2? |
|--------|------|------|----------|-------------|
| `POST` | `/api/v1/public/auth/google` | Público | `/public/candidate-auth/google` | **Sim** |
| `POST` | `/api/v1/public/auth/login` | Público | `/public/candidate-auth/login` | **Sim** |
| `POST` | `/api/v1/public/auth/logout` | Cookie candidato | `/public/candidate-auth/logout` | **Sim** |

---

### 4. Portal do candidato

| Método | Path | Auth | Novo em C2? |
|--------|------|------|-------------|
| `GET`   | `/api/v1/public/candidate-portal/overview` | `CurrentCandidateSession` | Não |
| `PATCH` | `/api/v1/public/candidate-portal/profile` | `CurrentCandidateSession` | Não |
| `POST`  | `/api/v1/public/candidate-portal/resume` | `CurrentCandidateSession` | Não |

---

### 5. Avaliação comportamental — aliases oficiais

| Método | Path | Auth | Alias de | Novo em C2? |
|--------|------|------|----------|-------------|
| `GET`  | `/api/v1/public/candidate-portal/behavioral-assessments` | `CurrentCandidateSession` | `/candidate-portal/behavioral-assessments` | **Sim** |
| `GET`  | `/api/v1/public/candidate-portal/behavioral-assessments/{assignment_id}` | `CurrentCandidateSession` | idem | **Sim** |
| `POST` | `/api/v1/public/candidate-portal/behavioral-assessments/{assignment_id}/start` | `CurrentCandidateSession` | idem | **Sim** |
| `PUT`  | `/api/v1/public/candidate-portal/behavioral-assessments/{assignment_id}/answers` | `CurrentCandidateSession` | idem | **Sim** |
| `POST` | `/api/v1/public/candidate-portal/behavioral-assessments/{assignment_id}/submit` | `CurrentCandidateSession` | idem | **Sim** |

---

### 6. Pré-admissão — aliases oficiais

| Método | Path | Auth | Alias de | Novo em C2? |
|--------|------|------|----------|-------------|
| `GET`  | `/api/v1/public/candidate-portal/pre-admission` | `CurrentCompleteCandidateSession` | `/candidate-portal/pre-admission` | **Sim** |
| `GET`  | `/api/v1/public/candidate-portal/pre-admission/{case_id}` | `CurrentCompleteCandidateSession` | idem | **Sim** |
| `POST` | `/api/v1/public/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents` | `CurrentCompleteCandidateSession` | idem | **Sim** |
| `GET`  | `/api/v1/public/candidate-portal/pre-admission/documents/{document_id}/download` | `CurrentCompleteCandidateSession` | idem | **Sim** |

> **Nota sobre o path de upload**: o brief documenta o path simplificado
> `POST /pre-admission/documents`, mas os parâmetros `case_id` e `item_id` são
> obrigatórios para identificar o item de checklist correto. O alias mantém
> o path completo idêntico ao endpoint original.

---

## Endpoints antigos mantidos por compatibilidade

Os seguintes endpoints continuam funcionando sem alteração:

```
GET  /api/v1/public/jobs
GET  /api/v1/public/candidates/check-exists
POST /api/v1/public/candidates/apply
POST /api/v1/public/candidate-auth/google       ← mantido
POST /api/v1/public/candidate-auth/login        ← mantido
POST /api/v1/public/candidate-auth/logout       ← mantido
GET  /api/v1/public/candidate-portal/overview
PATCH /api/v1/public/candidate-portal/profile
POST /api/v1/public/candidate-portal/resume
GET  /api/v1/candidate-portal/behavioral-assessments         ← mantido
GET  /api/v1/candidate-portal/behavioral-assessments/{id}    ← mantido
POST /api/v1/candidate-portal/behavioral-assessments/{id}/start
PUT  /api/v1/candidate-portal/behavioral-assessments/{id}/answers
POST /api/v1/candidate-portal/behavioral-assessments/{id}/submit
GET  /api/v1/candidate-portal/pre-admission
GET  /api/v1/candidate-portal/pre-admission/{case_id}
POST /api/v1/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents
GET  /api/v1/candidate-portal/pre-admission/documents/{document_id}/download
```

---

## Autenticação e sessão

| Tipo | Mecanismo | Onde é usado |
|------|-----------|--------------|
| Público | Sem auth | `/public/jobs`, `/candidates/check-exists` |
| Rate-limit IP | Dependência fastapi | `/candidates/apply`, `/candidates/check-exists` |
| `CurrentCandidateSession` | Cookie `candidate_portal_session` | Behavioral assessments, overview, profile, resume |
| `CurrentCompleteCandidateSession` | Cookie + perfil completo exigido | Pre-admission |
| OAuth Google | `id_token` no body | `/auth/google` |

---

## Ownership e autorização por recurso

| Recurso | Regra de ownership |
|---------|-------------------|
| Behavioral assignment (detalhe/start/answers/submit) | `assignment.candidate_id == session.candidate_id` — verificado pelo `BehavioralAssignmentService` |
| Pre-admission case | `case.candidate_id == session.candidate_id` — verificado pelo `PreAdmissionService` |
| Pre-admission document download | `document.case.candidate_id == session.candidate_id` — verificado pelo `PreAdmissionService` com `actor_type="candidate"` |
| Job detail | Público — apenas vagas `status=published` |

---

## Dados permitidos

- Título, descrição, requisitos, responsabilidades, local, área, modelo, senioridade, benefícios, horário, data de publicação da vaga
- Dados do próprio candidato autenticado
- Status das próprias avaliações comportamentais (sem parecer interno)
- Status dos próprios documentos de pré-admissão
- Mensagens do RH endereçadas ao próprio candidato

---

## Dados proibidos

Os seguintes dados NUNCA devem aparecer em respostas públicas:

```
match_score / ai_score / ranking
internal_notes / manager_notes / parecer comportamental interno
protheus / erp / dados de integração ERP
internal_events / audit / logs internos
prompt / configuração de IA interna
created_by (UUID interno do criador da vaga)
quality_score / quality_status (score interno de qualidade)
deal_breakers / screening_questions / behavioral_template_id (config interna de triagem)
job_profile_json / skill_requirements / mandatory_skills (config interna de matching)
dados de outros candidatos
pipeline interna detalhada (stage, scores, decisões internas)
```

---

## Uploads

| Endpoint | Tipo | Validações mantidas |
|----------|------|---------------------|
| `POST /public/candidates/apply` | Currículo PDF | Tamanho, content-type, LGPD |
| `POST /public/candidate-portal/resume` | Currículo PDF | `CandidatePortalService.upload_resume()` |
| `POST /public/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents` | Documento pré-admissão | `MAX_PRE_ADMISSION_DOCUMENT_BYTES`, ownership |

---

## Erros esperados

| Status | Situação |
|--------|---------|
| 401 | Sem sessão válida de candidato |
| 403 | Sessão válida mas perfil incompleto (`CurrentCompleteCandidateSession`) |
| 404 | Recurso não encontrado ou não pertence ao candidato autenticado |
| 409 | Duplicidade (CPF/email já existente, assessment já submetido) |
| 422 | Dados inválidos (arquivo inválido, campo obrigatório ausente) |
| 429 | Rate limit excedido (apply/check-exists) |

---

## Próximas fases

**C3 — Integração controlada do `candidate-portal/` com `/api/v1/public/*`**

- Substituir `mockCandidatePortalService` por `publicApiClient` real
- Implementar `PrivateRoute` com cookie de sessão do candidato
- Configurar CORS para o domínio do portal público
- Implementar refresh automático de sessão

**C4 — Funcionalidades complementares (se necessário)**

- Endpoint por slug (`GET /public/jobs/{slug}`) — requer migration para adicionar coluna `slug`
- Endpoint simplificado de upload de pré-admissão sem `case_id/item_id` — requer mudança de serviço
