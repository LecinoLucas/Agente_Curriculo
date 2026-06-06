# Auditoria: Preenchimento de Vaga com IA — FASE JOB-AI-AUDIT-1

**Data:** 2026-06-06  
**Responsável:** Antigravity  
**Escopo:** Apenas fluxo de geração de rascunho IA para vagas. Sem ranking, pipeline, pré-admissão ou Protheus.

---

## 1. Arquivos Auditados

### Backend
| Arquivo | Tamanho | Papel |
|---|---|---|
| `backend/src/interface/api/routers/jobs.py` | 50 KB | Endpoints REST — contém `/ai-draft/ocr` e `/ai-draft/generate` |
| `backend/src/interface/api/schemas/job_schemas.py` | 31 KB | Schemas Pydantic — contém `AiDraftGenerateRequest`, `AiDraftFieldsResponse`, `AiDraftGenerateResponse` |
| `backend/src/application/services/job_ai_draft_service.py` | 13 KB | Serviço principal de geração de rascunho com IA |
| `backend/tests/unit/test_job_ai_draft_service.py` | 18 KB | Testes unitários do serviço |

### Frontend
| Arquivo | Tamanho | Papel |
|---|---|---|
| `frontend/src/features/jobs/components/JobAiDraftPanel.tsx` | 18 KB | Painel visual de IA no formulário de vaga |
| `frontend/src/features/jobs/utils/mockJobAiDraft.ts` | 5 KB | Utilitário de mock — função `generateMockJobDraft`, tipo `JobAiDraft`, `applyDraftToForm` |
| `frontend/src/features/jobs/services/jobAiDraftService.ts` | 2.6 KB | Cliente HTTP real — `generateJobAiDraft`, `extractJobTextFromImage` |
| `frontend/src/features/jobs/__tests__/JobAiDraftPanel.test.tsx` | 5.8 KB | Testes do painel de IA |
| `frontend/src/features/jobs/jobFormConfig.ts` | 13 KB | Configuração do formulário — `buildCreateJobPayload`, `buildUpdateJobPayload` |
| `frontend/src/pages/JobFormPage.tsx` | 36 KB | Página principal do formulário de vaga, integra `JobAiDraftPanel` |

---

## 2. Fluxo Atual Encontrado

### Backend — Estado: ✅ FUNCIONAL e bem implementado

O backend possui um fluxo completo e real:

1. **Endpoint OCR**: `POST /api/v1/jobs/ai-draft/ocr`
   - Recebe imagem (PNG/JPEG/WebP)
   - Executa OCR local (não IA)
   - Retorna texto extraído
   - Rate-limited

2. **Endpoint Generate**: `POST /api/v1/jobs/ai-draft/generate`
   - Recebe `{ text_input, ocr_text }`
   - Chama `JobAiDraftService.generate()`
   - Trata `AiDraftValidationError` → 422
   - Trata `AiDraftParseError` → 502
   - Trata `AiDraftAIError` → 503
   - Persiste log de uso de IA
   - Retorna `AiDraftGenerateResponse` estruturado

3. **Serviço `JobAiDraftService`**:
   - Sanitiza input (remove chars de controle, normaliza unicode, colapsa espaços)
   - Trunca input nos limites (6.000 chars texto, 12.000 chars OCR, 12.000 combinado)
   - Chama a IA via `AIServiceFactory` (respeita o provider configurado)
   - Parseia JSON via `extract_json()` + `_parse_draft()`
   - Normaliza `work_model` e `seniority` para enums válidos (ou null se inválido)
   - Normaliza listas via `_safe_list()` (máx 10 items, strip, descarta vazios)
   - Computa `needs_review` (flags campos críticos ausentes)
   - Registra tokens e custo

4. **Schema `AiDraftFieldsResponse`** — campos retornados:
   - `title`, `area`, `seniority`, `work_model`, `unit`
   - `salary_min`, `salary_max`
   - `description`, `responsibilities[]`, `requirements[]`
   - `mandatory_skills[]`, `nice_to_have_skills[]`
   - `benefits[]`, `working_hours`
   - `screening_questions[]`, `pipeline_steps[]`, `matching_criteria[]`
   - `requires_manager_review`, `requires_behavioral_assessment`

5. **Prompt do sistema** — contém regras de segurança:
   - Anti-injeção de prompt
   - Não inventar salário se ausente
   - Não inventar benefícios ou unidade
   - Escrever em português do Brasil

6. **Testes existentes** (51 testes unitários em `test_job_ai_draft_service.py`):
   - Validação de inputs vazios ✅
   - Happy path com text/ocr ✅
   - needs_review flags ✅
   - Erros de IA e parse ✅
   - Token logging ✅
   - Sanitização ✅
   - Truncação ✅

### Frontend — Estado: ⚠️ MOCK EM PRODUÇÃO — NÃO CONECTADO AO BACKEND

**O problema central:** O `JobAiDraftPanel.tsx` usa `generateMockJobDraft` do arquivo `mockJobAiDraft.ts`, que é uma função local que simula a IA com dados estáticos após 650ms de sleep artificial. **O serviço real (`jobAiDraftService.ts`) existe mas não é usado pelo painel.**

Divergências encontradas:
- O tipo `JobAiDraft` (mock) e `JobAiDraftFields` (serviço real) são diferentes e não alinhados
- O mock retorna sempre os mesmos dados independentemente do input real
- O painel mostra badges "Sem backend" e "Simulação visual" — deixando claro que é provisório
- Testes do painel testam apenas o comportamento mock (650ms sleep), não a API real
- A UI tem infraestrutura completa: loading, error, preview, apply, discard, confirmação de substituição

**O que funciona bem no frontend:**
- `applyDraftToForm()` mapeia corretamente draft → campos do formulário
- A lógica de confirmação ao sobrescrever campos já preenchidos
- O formulário aceita todos os campos necessários
- `jobFormConfig.ts` inclui normalização de listas de IA

---

## 3. Lacunas Identificadas

### Lacuna Principal (P0 — Bloqueadora)
| # | Lacuna | Arquivo | Impacto |
|---|---|---|---|
| L1 | `JobAiDraftPanel` usa mock local em vez da API real | `JobAiDraftPanel.tsx` | Rascunho IA nunca é gerado de verdade |

### Lacunas de Tipo (P1 — Alta prioridade)
| # | Lacuna | Arquivo |
|---|---|---|
| L2 | Tipo `JobAiDraft` (mock) ≠ `JobAiDraftFields` (serviço real) — usar o real | `mockJobAiDraft.ts` vs `jobAiDraftService.ts` |
| L3 | `applyDraftToForm` recebe `JobAiDraft`, precisa aceitar `JobAiDraftFields` | `mockJobAiDraft.ts` |
| L4 | `AiDraftFieldsResponse` não tem campo `location` (tem `unit`) — mapear corretamente | `job_schemas.py` |
| L5 | `responsibilities` e `requirements` vêm como `list[str]` do backend, mas `applyDraftToForm` os une com `\n` — pode conflitar com `StringListField` | `mockJobAiDraft.ts` |

### Lacunas de Testes (P2 — Necessários pelo escopo)
| # | Lacuna | Arquivo |
|---|---|---|
| L6 | Testes do painel testam apenas mock — precisam testar chamada real (com mock do serviço) | `JobAiDraftPanel.test.tsx` |
| L7 | Faltam testes de: botão gerar com IA real, loading, preview real, aplicar rascunho real, descartar, erro HTTP | `JobAiDraftPanel.test.tsx` |
| L8 | Backend não tem teste garantindo que critérios discriminatórios são bloqueados/removidos | `test_job_ai_draft_service.py` |
| L9 | Backend não tem teste garantindo que salary/location não são inventados quando ausentes | `test_job_ai_draft_service.py` |
| L10 | Backend não tem teste de normalização de listas (dedup, trim) | `test_job_ai_draft_service.py` (tem implicitamente, mas não explícito) |

### Lacunas de Segurança/Qualidade (P2)
| # | Lacuna | Arquivo |
|---|---|---|
| L11 | `_parse_draft` não verifica se `title` é campo vazio/só espaços — pode retornar `"  "` | `job_ai_draft_service.py` |
| L12 | Prompt não menciona explicitamente bloqueio de critérios discriminatórios (idade, gênero, etc.) | `job_ai_draft_service.py` |
| L13 | `responsibilities` e `requirements` são `list[str]` no backend mas o formulário tem campos de texto livre — mapeamento assimétrico | `job_schemas.py` vs `JobFormPage.tsx` |

---

## 4. Decisões Tomadas

### D1 — Substituir mock por chamada real no `JobAiDraftPanel`
O `JobAiDraftPanel` será refatorado para usar `generateJobAiDraft` de `jobAiDraftService.ts`. O tipo interno do draft mudará de `JobAiDraft` para `JobAiDraftFields` (do serviço real). A função `applyDraftToForm` será movida/adaptada para funcionar com o tipo real.

### D2 — Manter `mockJobAiDraft.ts` apenas como fixture de teste
O arquivo continuará existindo para não quebrar testes existentes, mas o painel não o usará mais em produção.

### D3 — Mapear `unit` para `location` no `applyDraftToForm`
O backend retorna `unit` (cidade/local), que deve ser mapeado para o campo `location` do formulário.

### D4 — Manter `responsibilities[]` e `requirements[]` como arrays
O formulário possui campos de texto livre (`responsibilities`, `requirements`) que aceitam texto com `\n`. O mapeamento será `array.join('\n')`.

### D5 — Adicionar bloqueio explícito de critérios discriminatórios no prompt
Adicionar uma lista negra explícita no system prompt do backend para reforçar a proibição.

### D6 — Criar hook `useJobAiDraft` para encapsular estado e chamada real
Para manter `JobAiDraftPanel.tsx` limpo e testável, a lógica de chamada será extraída para um hook dedicado.

### D7 — NÃO alterar migrations, ranking, pipeline, pré-admissão ou Protheus
Escopo estritamente limitado ao fluxo de draft de vaga.

---

## 5. Campos Suportados pelo Backend

| Campo | Backend (`AiDraftFieldsResponse`) | Mapeado para formulário? |
|---|---|---|
| `title` | ✅ | ✅ `title` |
| `description` | ✅ | ✅ `description` |
| `area` | ✅ | ✅ `job_area` |
| `seniority` | ✅ (enum validado) | ✅ `seniority_level` |
| `work_model` | ✅ (enum validado) | ✅ `work_model` |
| `unit` / location | ✅ como `unit` | ✅ mapear → `location` |
| `responsibilities` | ✅ `list[str]` | ✅ `responsibilities` (join '\n') |
| `requirements` | ✅ `list[str]` | ✅ `requirements` (join '\n') |
| `mandatory_skills` | ✅ `list[str]` | ✅ `mandatory_skills` |
| `nice_to_have_skills` | ✅ `list[str]` | ✅ `nice_to_have_skills` |
| `screening_questions` | ✅ `list[str]` | ✅ `screening_questions` |
| `benefits` | ✅ `list[str]` | ✅ `benefits` |
| `working_hours` | ✅ `str\|null` | ✅ `working_hours` |
| `salary_min` / `salary_max` | ✅ `float\|null` (não inventado) | ⚠️ não mapeado (campo de número, seguro omitir) |
| `requires_manager_review` | ✅ | ✅ `requires_manager_review` |
| `requires_behavioral_assessment` | ✅ | ✅ `requires_behavioral_assessment` |
| `pipeline_steps` | ✅ `list[str]` | ❌ não mapeado (correto — não expor ao formulário) |
| `matching_criteria` | ✅ `list[str]` | ❌ não mapeado (correto — interno) |
| `employment_type` | ❌ ausente no backend | — |

---

## 6. Plano de Implementação

### 6.1 Backend (sem alterações de models/migrations)

**B1 — Reforçar prompt com lista negra de critérios discriminatórios**
- Arquivo: `job_ai_draft_service.py`
- Adicionar ao system prompt a proibição explícita de: idade, gênero, raça, religião, estado civil, saúde, deficiência, aparência

**B2 — Reforçar `_parse_draft` com validação de title vazio**
- Arquivo: `job_ai_draft_service.py`
- Garantir que `title = None` se a string for apenas espaços

**B3 — Adicionar testes de segurança e normalização**
- Arquivo: `tests/unit/test_job_ai_draft_service.py`
- Testes: critérios discriminatórios, salary não inventado, location não inventada, normalização de listas

### 6.2 Frontend

**F1 — Criar hook `useJobAiDraft`**
- Arquivo: `frontend/src/features/jobs/hooks/useJobAiDraft.ts` (NOVO)
- Encapsula: status, draft, errorMessage, prompt, handleGenerate

**F2 — Criar função `applyApiDraftToForm`**
- Arquivo: `frontend/src/features/jobs/utils/jobAiDraftHelpers.ts` (NOVO)
- Mapeia `JobAiDraftFields` → `Partial<JobFormValues>`
- Separada de `mockJobAiDraft.ts` para não quebrar testes existentes

**F3 — Refatorar `JobAiDraftPanel` para usar API real**
- Arquivo: `frontend/src/features/jobs/components/JobAiDraftPanel.tsx`
- Trocar `generateMockJobDraft` por chamada real via `generateJobAiDraft`
- Remover badges "Sem backend" e "Simulação visual"
- Usar `JobAiDraftFields` como tipo interno do draft

**F4 — Adicionar testes do painel com API mockada**
- Arquivo: `frontend/src/features/jobs/__tests__/JobAiDraftPanel.test.tsx`
- Testes: loading real, preview real, apply, discard, erro HTTP, não sobrescrever campos manuais

---

## 7. Testes Adicionados

### Backend (a adicionar)
- `test_salary_not_invented_when_absent` — garante salary_min/max null quando input não menciona salário
- `test_location_not_invented_when_absent` — garante unit null quando input não menciona local
- `test_sensitive_criteria_blocked_by_prompt_rules` — verifica que prompt tem guardrails
- `test_list_normalization_dedup_and_trim` — dedup case-insensitive e trim em listas

### Frontend (a adicionar)
- `calls real api on generate` — garante que o painel chama `generateJobAiDraft` (não mock)
- `shows loading state during generation` — loading real da API
- `shows api error message` — erro HTTP exibido corretamente
- `applies real draft to form` — `applyApiDraftToForm` chamado com resposta real
- `discard draft resets state` — botão descartar reseta o state
- `does not overwrite manually set fields` — campos manuais preservados na aplicação parcial

---

## 8. Riscos Restantes

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | IA pode gerar `title` muito genérico para vagas não convencionais | Baixa | Usuário sempre revisa antes de aplicar |
| R2 | `salary_min`/`salary_max` do draft não são mapeados para o formulário — se a IA retornar valores, são descartados | Baixa | Intencional — salário exige revisão manual cuidadosa |
| R3 | `employment_type` não é suportado pelo backend (não está no schema IA) | Baixa | Campos do formulário manual cobre |
| R4 | A função `_safe_list` limita a 10 itens — se a IA retornar mais, são truncados silenciosamente | Baixa | Aceitável para UX |
| R5 | Rate limiting do endpoint de geração pode rejeitar chamadas em burst | Média | Comportamento esperado — exibir erro claro ao usuário |
| R6 | O mapeamento de `seniority` (enum do backend: `intern\|junior\|mid\|senior\|lead\|principal\|director`) pode não cobrir todos os valores do formulário | Baixa | Backend normaliza para null se inválido; usuário corrige |
| R7 | Testes do painel existentes (baseados em mock) podem precisar de `vi.mock` separado para coexistir com novos testes da API real | Média | Tratar com módulo de mock separado no vitest |

---

## 9. Git Status no Início da Auditoria

```
(repositório limpo — sem mudanças pendentes)
```
