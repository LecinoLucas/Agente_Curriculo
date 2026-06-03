# AUDIT_REPORT — Fase AUDIT-FAIL-PERF-1

**Data:** 2026-06-03  
**Branch auditado:** `save/behavioral-ai-and-wips`  
**Modelo:** Claude Sonnet 4.6  
**Escopo:** Backend (FastAPI/SQLAlchemy), Frontend Staff, Candidate Portal

---

## SUMÁRIO DE SEVERIDADES

| Severidade | Backend | Frontend Staff | Candidate Portal | Total |
|------------|---------|---------------|-----------------|-------|
| CRÍTICO     | 5       | 1             | 1               | 7     |
| ALTO        | 3       | 0             | 1               | 4     |
| MÉDIO       | 4       | 1             | 1               | 6     |
| BAIXO       | 3       | 1             | 1               | 5     |
| **Total**   | **15**  | **3**         | **4**           | **22**|

---

## BACKEND

### CRÍTICO

---

#### B-CRIT-01 — `analysis_service.py:523` — `_maybe_await` indefinido (NameError)

**Arquivo:** `backend/src/application/services/analysis_service.py:523`  
**Regra ruff:** `F821 Undefined name _maybe_await`

**Evidência:**
```python
# linha 518-525
async def _safe_session_flush(session: object | None) -> None:
    flush_fn = getattr(session, "flush", None)
    if not callable(flush_fn):
        return
    try:
        await _maybe_await(flush_fn())   # ← F821: _maybe_await não existe
    except Exception:
        logger.debug("analysis_service.session_flush_unavailable", exc_info=True)
```

`_maybe_await` não está definido em lugar algum do módulo nem importado. Qualquer chamada a `_safe_session_flush` com uma session válida resulta em `NameError` em runtime.

**Impacto:** Qualquer fluxo de análise que acione `_safe_session_flush` lança exceção não tratada.

---

#### B-CRIT-02 — `analysis_service.py:1197,1199` — `ValidationException` indefinida (NameError)

**Arquivo:** `backend/src/application/services/analysis_service.py:1197,1199`  
**Regra ruff:** `F821 Undefined name ValidationException`

**Evidência:**
```python
# linha 1196-1199
if analysis.status == "discarded":
    raise ValidationException("A análise já está descartada.")   # ← F821
if analysis.status in {"processing", "retry_scheduled"}:
    raise ValidationException("Não é possível descartar uma análise em processamento.")   # ← F821
```

`ValidationException` não está importada em `analysis_service.py` (confirmado: `grep "from.*import.*ValidationException"` não retorna nada). O módulo importa da maioria dos lugares mas não desta exception.

**Impacto:** Método `discard()` lança `NameError` ao invés de `ValidationException` quando análise está em estado inválido.

---

#### B-CRIT-03 — `analysis_service.py:505-514` — Chaves duplicadas no dicionário (bug de corretude silencioso)

**Arquivo:** `backend/src/application/services/analysis_service.py:505-514`  
**Regra ruff:** `F601 Dictionary key literal repeated`

**Evidência:**
```python
# Bloco 1 (correto, com dados completos):
"priority_score_weighted": priority_score_weighted,       # linha ~490
"complementary_score_weighted": complementary_score_weighted,
"complementary_score_raw_weighted": complementary_score_raw_weighted,
"priority_strong_coverage": priority_strong_coverage,
"priority_matched": len(matched_priority_skill_names),
"complementary_matched": sum(1 for s in complementary_scores if s >= Decimal("0.8")),
"matched_priority_skill_names": matched_priority_skill_names,
"matched_complementary_skill_names": matched_complementary_skill_names,
"missing_complementary_skill_names": missing_complementary_skill_names,
"complementary_bonus_cap_slots": complementary_bonus_cap_slots,

# Bloco 2 (sobrescreve o bloco 1 — linhas 505-514):
"priority_score_weighted": priority_score_weighted,       # linha 505
"complementary_score_weighted": complementary_score_weighted,
"complementary_score_raw_weighted": complementary_score_raw_weighted,
"priority_strong_coverage": priority_strong_coverage,
"priority_matched": len(matched_priority_skill_names),
"complementary_matched": sum(1 for s in complementary_scores if s >= Decimal("0.8")),
"matched_priority_skill_names": matched_priority_skill_names,
"matched_complementary_skill_names": matched_complementary_skill_names,
"missing_complementary_skill_names": missing_complementary_skill_names,
"complementary_bonus_cap_slots": complementary_bonus_cap_slots,
```

10 chaves duplicadas em um dict literal. Python silenciosamente mantém a última ocorrência. A função `_build_skill_score_data_dict` provavelmente foi editada em duplicidade acidentalmente.

**Impacto:** Os dados retornados para o cálculo de score têm valores potencialmente inconsistentes. Não causa exceção, mas produz resultados errados se os dois blocos divergirem no futuro.

---

#### B-CRIT-04 — `candidate_model.py:151` e `resume_model.py:54` — Forward references circulares não resolvidas

**Arquivos:**  
- `backend/src/infrastructure/database/models/candidate_model.py:151` — `F821 Undefined name ResumeModel`
- `backend/src/infrastructure/database/models/resume_model.py:54` — `F821 Undefined name CandidateModel`

**Evidência (ruff):**
```
src/infrastructure/database/models/candidate_model.py:151:27: F821 Undefined name `ResumeModel`
src/infrastructure/database/models/resume_model.py:54:24: F821 Undefined name `CandidateModel`
```

Os dois modelos se referenciam mutuamente em type annotations sem `from __future__ import annotations` ou uso de `TYPE_CHECKING`. A referência circular não está resolvida pelo SQLAlchemy lazy-string typing.

**Impacto:** Pode causar `NameError` ou erro de carregamento do ORM ao inicializar a aplicação, dependendo da ordem de importação.

---

#### B-CRIT-05 — `GET /pipeline/{job_id}` (Kanban) sem paginação — risco de timeout em vagas com muitos candidatos

**Arquivo:** `backend/src/interface/api/routers/pipeline.py:205` + `pipeline_service.py:400` + `sqlalchemy_pipeline_repository.py:340`

**Evidência:**
```python
# pipeline.py
@router.get("/{job_id}", response_model=PipelineBoardResponse)
async def get_pipeline_board(job_id: UUID, ...):
    return await _service(db).get_board(job_id, filters)

# pipeline_service.py
async def get_board(self, job_id, filters):
    matches = await self.list_job_matches(job_id, filters)  # ← sem LIMIT
    by_stage = {stage: [] for stage in KANBAN_STAGES}
    for item in matches:                                     # ← itera tudo em memória
        by_stage[item.stage].append(item)
```

O endpoint retorna **todos** os candidatos da vaga em uma única resposta. A query SQL usa múltiplos CTEs mas sem `LIMIT`. Com 500+ candidatos por vaga, a resposta pode ser muito grande e lenta.

**Impacto:** Lentidão progressiva conforme o volume de candidaturas cresce. Risco de timeout ou resposta pesada no frontend.

---

### ALTO

---

#### B-HIGH-01 — `analysis_service.py:1761` — variável `complementary_score_raw` calculada e descartada

**Arquivo:** `backend/src/application/services/analysis_service.py:1761`  
**Regra ruff:** `F841 Local variable complementary_score_raw is assigned to but never used`

**Evidência:**
```python
complementary_score_raw = ...  # calculado mas nunca referenciado depois
```

**Impacto:** O campo `complementary_score_raw_weighted` provavelmente deveria usar este valor em algum ponto, mas o resultado do cálculo é descartado. Possível bug silencioso nos scores de análise.

---

#### B-HIGH-02 — `candidate_service.py:546` — `gate_pendencies_evaluated` nunca usada

**Arquivo:** `backend/src/application/services/candidate_service.py:546`  
**Regra ruff:** `F841 Local variable gate_pendencies_evaluated is assigned to but never used`

**Impacto:** Lógica de verificação de gate parece incompleta. Os dados são coletados mas o resultado nunca é avaliado/usado, potencialmente deixando gates bypass silencioso.

---

#### B-HIGH-03 — `pipeline_service.py:560` — `gates_at_check` calculada e descartada

**Arquivo:** `backend/src/application/services/pipeline_service.py:560`  
**Regra ruff:** `F841 Local variable gates_at_check is assigned to but never used`

**Impacto:** Similar ao B-HIGH-02. Dado coletado para verificação de gates mas nunca usado na lógica subsequente. Risco de gates não verificados.

---

### MÉDIO

---

#### B-MED-01 — `conversation_upload.py` — `db.commit()` dentro do service (inconsistência arquitetural)

**Arquivo:** `backend/src/interface/api/routers/conversation_upload.py:62`

**Evidência:**
```python
class ConversationUploadService:
    async def upload_pending_resume(self, session_id, file):
        ...
        await self._db.commit()   # ← commit dentro do service
        await self._db.refresh(session)
```

Todos os outros routers do sistema fazem `await db.commit()` no nível do router após o service retornar. Aqui o commit é feito dentro do service, o que pode causar transações parciais se o upload for parte de um fluxo maior ou se o router fizer operações adicionais depois.

**Impacto:** Risco de inconsistência de transação. Não é bug imediato mas viola o padrão estabelecido.

---

#### B-MED-02 — `GET /pipeline/jobs` sem paginação — lista completa de vagas

**Arquivo:** `backend/src/interface/api/routers/pipeline.py:191`

**Evidência:**
```python
@router.get("/jobs", response_model=list[PipelineJobSummaryResponse])
async def list_pipeline_jobs(include_closed: bool = False, ...):
    return await _service(db).list_pipeline_jobs(include_closed=include_closed)
```

Retorna **todas** as vagas do pipeline sem paginação. Com muitas vagas, a resposta pode ser volumosa.

---

#### B-MED-03 — `interview_calendar_sync_service.py:204` — resultado de operação descartado

**Arquivo:** `backend/src/application/services/interview_calendar_sync_service.py:204`  
**Regra ruff:** `F841 Local variable result is assigned to but never used`

**Impacto:** Uma operação de sincronização de calendário retorna um resultado que é completamente ignorado, impossibilitando verificação de sucesso ou tratamento de falha.

---

#### B-MED-04 — `analysis_service.py:49-103` — imports de nível de módulo fora do topo (E402)

**Arquivo:** `backend/src/application/services/analysis_service.py`  
**Regra ruff:** `E402 Module level import not at top of file` (22 ocorrências)

**Impacto:** Indica que o arquivo tem código executado antes dos imports (provavelmente uma guarda condicional). Não é bug direto mas torna a estrutura do módulo frágil.

---

### BAIXO

---

#### B-LOW-01 — `job_area_service.py:48,93` — re-raise sem chaining (`raise ... from err`)

**Arquivo:** `backend/src/application/services/job_area_service.py:48,93`  
**Regra ruff:** `B904`

**Impacto:** Traceback silencia a causa raiz. Dificulta debugging.

---

#### B-LOW-02 — `file_scanner.py:14,18` — nomes de exceção sem sufixo `Error`

**Arquivo:** `backend/src/application/services/file_scanner.py:14,18`  
**Regra ruff:** `N818`

**Evidência:**
```python
class FileScanThreatFound(Exception): ...  # deveria ser FileScanThreatFoundError
class FileScanUnavailable(Exception): ...  # deveria ser FileScanUnavailableError
```

---

#### B-LOW-03 — `pre_admission_state_machine.py:90,92` — `getattr`/`setattr` com string literal constante

**Arquivo:** `backend/src/application/services/pre_admission_state_machine.py:90,92`  
**Regra ruff:** `B009, B010`

**Impacto:** Acesso a atributo via `getattr(obj, "campo")` ao invés de `obj.campo` reduz clareza e type-checking.

---

## FRONTEND STAFF

### CRÍTICO

---

#### FS-CRIT-01 — `CandidaturasPage.tsx` — busca sem debounce dispara API a cada keystroke

**Arquivo:** `frontend/src/pages/CandidaturasPage.tsx:1194-1202`

**Evidência:**
```tsx
const [search, setSearch] = useState("");

useEffect(() => {
  void load(page, search);   // ← dispara API cada vez que `search` muda
}, [load, page, search]);

function handleSearchChange(value: string) {
  setSearch(value);     // ← nenhum debounce aqui
  setPage(1);
}
```

Cada caractere digitado no campo de busca dispara uma chamada à API de candidatos. Não há `useDebounce`, `setTimeout`, nem `useTransition`. Em digitação rápida (ex: "João Silva"), isso resulta em ~10 requests simultâneas.

**Impacto:** Sobrecarga da API, resultados de race condition (resposta anterior pode sobrescrever a mais recente), degradação de UX.

---

### MÉDIO

---

#### FS-MED-01 — `PipelinePage.tsx` — excesso de `useEffect` para sincronização de refs (15+)

**Arquivo:** `frontend/src/pages/PipelinePage.tsx:153-169`

**Evidência:**
```tsx
useEffect(() => { activeJobIdRef.current = activeJobId; }, [activeJobId]);
useEffect(() => { boardLoadingRef.current = boardLoading; }, [boardLoading]);
useEffect(() => { rankingLoadingRef.current = rankingLoading; }, [rankingLoading]);
useEffect(() => { showRankingRef.current = showRanking; }, [showRanking]);
useEffect(() => { previewCandidateIdRef.current = previewCandidateId; }, [previewCandidateId]);
```

5 `useEffect` apenas para sincronizar estado em refs, além de outros 10+ `useEffect` no componente. O padrão preferido é atualizar a ref no mesmo handler que muda o estado, ou usar `useCallback` com a ref diretamente.

**Impacto:** Renders extras desnecessários. Componente com 15+ `useEffect` é difícil de manter e propenso a loops sutis.

---

### BAIXO

---

#### FS-LOW-01 — `VagasPage.tsx` — filtro de busca client-side sem paginação server-side visível

**Arquivo:** `frontend/src/pages/VagasPage.tsx:81,116`

**Evidência:**
```tsx
filteredJobs,  // filtro aplicado sobre todos os jobs carregados
searchInput.trim()  // busca por string
```

A busca de vagas é aplicada client-side sobre todos os jobs carregados. Se o backend não paginar por padrão, o frontend carrega tudo e filtra localmente.

**Impacto:** Se houver muitas vagas, a resposta inicial é grande e o filtro em lista enorme pode ser lento.

---

## CANDIDATE PORTAL

### CRÍTICO

---

#### CP-CRIT-01 — `conversationsService.ts:uploadResume` — erros do backend descartados silenciosamente

**Arquivo:** `candidate-portal/src/services/conversationsService.ts:141-150`

**Evidência:**
```typescript
uploadResume: async (sessionId: string, formData: FormData): Promise<void> => {
  const response = await fetch(`${BASE_URL}/conversations/${sessionId}/resume`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to upload resume');   // ← descarta status e mensagem real
  }
},
```

Ao contrário da função `request<T>()` do mesmo arquivo que extrai `json.detail` / `json.error.message` do response, `uploadResume` usa `fetch` diretamente e ao encontrar erro apenas lança `Error('Failed to upload resume')`, perdendo a mensagem real do backend (ex.: "Arquivo muito grande (máx 10MB)", "Tipo de arquivo não permitido", etc.).

**Impacto:** O usuário vê apenas "Falha no upload. Tente novamente." sem saber o motivo real (tamanho, tipo, etc.). Dificulta o diagnóstico em produção.

---

### ALTO

---

#### CP-HIGH-01 — `CandidateLoginPage.tsx:94` — `useEffect` sem array de dependências (roda em todo render)

**Arquivo:** `candidate-portal/src/pages/CandidateLoginPage.tsx:94-120`

**Evidência:**
```tsx
// Keep callback ref fresh without re-triggering the GSI load effect.
useEffect(() => {
  googleCallbackRef.current = async (response) => { ... };
});   // ← sem array de deps: roda em CADA render
```

O comentário reconhece que é intencional para manter a ref fresca. Porém roda em todo render do componente (incluindo re-renders causados por `setEmail`, `setPassword`, `setLoading`). O padrão correto seria `useCallback` + ref estabilizada, ou `useRef` com função que lê estado via closure.

**Impacto:** Não é bug de loop (não causa re-render), mas é anti-padrão que pode causar comportamento inesperado e dificulta lint/review.

---

### MÉDIO

---

#### CP-MED-01 — `conversationsService.ts` — base URL não alinhada ao host da página

**Arquivo:** `candidate-portal/src/services/conversationsService.ts:8-10`

**Evidência:**
```typescript
// conversationsService.ts (usado para /conversations — sem autenticação de cookie)
const BASE_URL = VITE_API_URL ?? 'http://localhost:8000/api/v1';

// publicApiClient.ts (usado para /public — COM cookie de sessão)
// Tem lógica de alignApiHostToPage() para resolver host mismatch
```

`conversationsService.ts` não usa `alignApiHostToPage()` do `publicApiClient.ts`. As conversas não precisam de cookie de sessão (são públicas), então não há impacto imediato. Mas se no futuro as rotas de conversa precisarem de autenticação, o mesmo bug de SameSite ocorrerá.

---

### BAIXO

---

#### CP-LOW-01 — `CandidatePortal2Page.tsx` — estado da tela reset após upload mas `phase` vai para `'loading'` transitoriamente

**Arquivo:** `candidate-portal/src/pages/CandidatePortal2Page.tsx:290-297`

**Evidência:**
```tsx
async function restartConversation() {
  ...
  setPhase('loading');
  setUploading(false);
  ...
  try {
    await createFreshSession();
  } catch {
    setPhase('init-error');
  }
}
```

Ao reiniciar a conversa, `setUploading(false)` é chamado depois de `setPhase('loading')` — pode causar flash visual se `uploading=true` antes do restart. Ordem de setState em batches do React 18 normalmente mitiga isso, mas não é garantido em versões mais antigas.

---

## RUFF — SUMÁRIO DE FINDINGS AUTOMATIZADOS

Executado: `.venv/bin/ruff check src tests`

| Tipo | Contagem | Descrição |
|------|----------|-----------|
| F821 | 5 | Nomes indefinidos (NameError em runtime) |
| F601 | 10 | Chaves duplicadas em dict literal |
| F841 | 4 | Variáveis locais atribuídas mas nunca usadas |
| F401 | ~25 | Imports não utilizados |
| E402 | ~20 | Imports fora do topo do módulo |
| B904 | 8 | Re-raise sem chaining (`raise ... from err`) |
| E501 | ~50 | Linhas muito longas (>100 chars) — cosmético |
| UP007/UP006 | ~30 | Uso de `Optional[X]` ao invés de `X | None` — cosmético |

**Os críticos são F821 e F601.** Os demais são cosmético/estilo.

---

## PYTEST

Execução: `.venv/bin/pytest tests -q`  
Resultado: **0 testes coletados** (banco de dados não disponível no ambiente de auditoria; testes requerem PostgreSQL ativo).

Evidência: `Pytest: No tests collected` — indica que os testes de integração dependem de banco de dados que não está acessível no ambiente atual.

---

## CHECKLIST DE ÁREAS NÃO COBERTAS

As áreas abaixo não foram auditadas em detalhe nesta fase (escopo focado em falhas e performance críticas):

- `behavioral_ai_evaluation_service.py` (60KB) — lógica de avaliação comportamental
- `analysis_ranking_service.py` — métricas de ranking detalhadas
- `admission_case_workspace_service.py` (35KB) — workspace de admissão
- `AgendaPage.tsx` (37KB) — página de agenda
- `CandidateProfilePage.tsx` (47KB) — perfil de candidato
- `BehavioralTemplateEditorPage.tsx` (58KB) — editor de templates
- Routers de integração ERP/Protheus
- Testes de contrato E2E (candidate-portal-smoke.spec.ts)
