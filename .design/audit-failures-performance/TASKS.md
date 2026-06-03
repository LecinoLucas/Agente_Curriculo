# TASKS — Plano de Correção (Fase AUDIT-FAIL-PERF-1)

**Gerado em:** 2026-06-03  
**Baseado em:** AUDIT_REPORT.md

> **Regras:** Nenhuma tarefa abaixo deve ser executada sem autorização explícita.  
> Não commitar, não pushar, não alterar regra de negócio, não criar migration.

---

## BLOCO 1 — CRÍTICOS: Corrija primeiro (NameError / bug de corretude)

### TASK-01 — Importar `ValidationException` em `analysis_service.py`
- **Arquivo:** `backend/src/application/services/analysis_service.py`
- **Problema:** `ValidationException` usada nas linhas 1197 e 1199 mas não importada.
- **Correção:** Adicionar `from src.domain.exceptions import ValidationException` no bloco de imports.
- **Risco:** Baixo — apenas adicionar import.
- **Referência:** AUDIT_REPORT.md → B-CRIT-02

---

### TASK-02 — Remover ou implementar `_maybe_await` em `analysis_service.py`
- **Arquivo:** `backend/src/application/services/analysis_service.py:523`
- **Problema:** `_maybe_await` chamado mas não definido. Causa `NameError`.
- **Opções:**
  - A) Implementar `_maybe_await`: `async def _maybe_await(val): return await val if asyncio.iscoroutine(val) else val`
  - B) Substituir pela chamada direta: `await flush_fn()` (se `flush` sempre é coroutine no SQLAlchemy async)
- **Recomendado:** Opção B — `flush()` em `AsyncSession` é sempre coroutine.
- **Risco:** Baixo — apenas corrige o call.
- **Referência:** AUDIT_REPORT.md → B-CRIT-01

---

### TASK-03 — Remover bloco duplicado de chaves no dict em `analysis_service.py`
- **Arquivo:** `backend/src/application/services/analysis_service.py:505-514`
- **Problema:** 10 chaves duplicadas em um dict literal (linhas 505-514 repetem linhas ~490-499).
- **Correção:** Remover o segundo bloco duplicado (linhas 505-514), verificar se era intenção alterar alguma das fórmulas.
- **Risco:** Médio — verificar se os dois blocos são idênticos ou se há diferença de fórmula antes de remover.
- **Referência:** AUDIT_REPORT.md → B-CRIT-03

---

### TASK-04 — Corrigir forward references circulares entre `CandidateModel` e `ResumeModel`
- **Arquivos:**
  - `backend/src/infrastructure/database/models/candidate_model.py:151`
  - `backend/src/infrastructure/database/models/resume_model.py:54`
- **Problema:** Referências circulares não resolvidas causam F821.
- **Correção:** Adicionar `from __future__ import annotations` no topo de ambos os arquivos, ou usar `TYPE_CHECKING` com string literal no relationship.
- **Risco:** Baixo — apenas ajuste de forward ref para annotations.
- **Referência:** AUDIT_REPORT.md → B-CRIT-04

---

### TASK-05 — Adicionar debounce na busca da `CandidaturasPage`
- **Arquivo:** `frontend/src/pages/CandidaturasPage.tsx:1194-1202`
- **Problema:** Sem debounce: cada keystroke dispara uma chamada à API.
- **Correção:**
  1. Criar hook `useDebounce<T>(value: T, delay: number): T` (ou instalar `use-debounce`)
  2. `const debouncedSearch = useDebounce(search, 300);`
  3. Alterar `useEffect` para depender de `debouncedSearch` ao invés de `search`
- **Risco:** Baixo — não altera lógica de negócio, apenas timing.
- **Referência:** AUDIT_REPORT.md → FS-CRIT-01

---

### TASK-06 — Propagar erro real do backend no `uploadResume` do candidate portal
- **Arquivo:** `candidate-portal/src/services/conversationsService.ts:141-150`
- **Problema:** Erros do backend descartados; usuário vê mensagem genérica.
- **Correção:** Usar a função `request<T>()` existente no arquivo para a chamada de upload, ou extrair o `json.detail` do response antes de lançar o erro:
  ```typescript
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const json = await response.json();
      if (json?.detail) message = String(json.detail);
      else if (json?.error?.message) message = String(json.error.message);
    } catch { /* ignore */ }
    throw new Error(message);
  }
  ```
- **Risco:** Baixo — não altera contrato, apenas melhora mensagem de erro.
- **Referência:** AUDIT_REPORT.md → CP-CRIT-01

---

## BLOCO 2 — ALTOS: Corrija após o bloco 1

### TASK-07 — Investigar e corrigir variável `complementary_score_raw` descartada
- **Arquivo:** `backend/src/application/services/analysis_service.py:1761`
- **Problema:** Variável calculada mas nunca usada. Possível bug de score.
- **Ação:** Ler o contexto da linha 1761 e determinar se deveria alimentar `complementary_score_raw_weighted` ou outro campo.
- **Risco:** Médio — pode alterar scores de análise. Requer revisão cuidadosa.
- **Referência:** AUDIT_REPORT.md → B-HIGH-01

---

### TASK-08 — Investigar `gate_pendencies_evaluated` em `candidate_service.py`
- **Arquivo:** `backend/src/application/services/candidate_service.py:546`
- **Problema:** Dados de verificação de gate coletados mas nunca usados.
- **Ação:** Ler o contexto e determinar se a verificação de gate deveria bloquear algo e não está.
- **Risco:** Alto — pode revelar gates bypass silencioso.
- **Referência:** AUDIT_REPORT.md → B-HIGH-02

---

### TASK-09 — Investigar `gates_at_check` em `pipeline_service.py`
- **Arquivo:** `backend/src/application/services/pipeline_service.py:560`
- **Problema:** Variável de verificação de gates calculada mas descartada.
- **Ação:** Ler o contexto e determinar se gates deveriam ser checados nesse ponto.
- **Risco:** Alto — gate bypass potencial.
- **Referência:** AUDIT_REPORT.md → B-HIGH-03

---

## BLOCO 3 — MÉDIOS: Corrija quando houver janela

### TASK-10 — Mover `db.commit()` do `ConversationUploadService` para o router
- **Arquivo:** `backend/src/interface/api/routers/conversation_upload.py:62`
- **Problema:** Commit feito dentro do service, inconsistente com padrão do projeto.
- **Correção:**
  1. Remover `await self._db.commit()` e `await self._db.refresh(session)` do service
  2. Fazer o commit e refresh no router após a chamada ao service
- **Risco:** Baixo — comportamento equivalente, apenas reorganização.
- **Referência:** AUDIT_REPORT.md → B-MED-01

---

### TASK-11 — Adicionar paginação ao `GET /pipeline/jobs`
- **Arquivo:** `backend/src/interface/api/routers/pipeline.py:191`
- **Problema:** Lista todas as vagas sem paginação.
- **Correção:** Adicionar `page` e `page_size` query params, ou pelo menos um `limit` no repositório.
- **Risco:** Médio — mudança de contrato público; frontend precisa ser atualizado junto.
- **Referência:** AUDIT_REPORT.md → B-MED-02

---

### TASK-12 — Adicionar limite/paginação ao board Kanban
- **Arquivo:** `backend/src/application/services/pipeline_service.py:400-427`
- **Problema:** `get_board` carrega todos os candidatos da vaga sem limite.
- **Opção A:** Adicionar `limit` configurável (ex: 200 por stage).
- **Opção B:** Paginar por stage via query param `?stage=screening&page=1`.
- **Risco:** Alto — mudança de contrato pode impactar o kanban frontend.
- **Referência:** AUDIT_REPORT.md → B-CRIT-05

---

### TASK-13 — Corrigir `useEffect` sem deps em `CandidateLoginPage.tsx`
- **Arquivo:** `candidate-portal/src/pages/CandidateLoginPage.tsx:94`
- **Problema:** `useEffect` sem array de dependências roda em cada render.
- **Correção:** Usar `useCallback` com dependências estáveis para o `googleCallbackRef`, ou adicionar `[]` ao `useEffect` e acessar o estado atual via ref separada.
- **Risco:** Baixo — não altera funcionalidade se feito corretamente.
- **Referência:** AUDIT_REPORT.md → CP-HIGH-01

---

## BLOCO 4 — BAIXOS / COSMÉTICO: Faça em batch

### TASK-14 — Corrigir re-raise sem chaining em `job_area_service.py`
- **Arquivo:** `backend/src/application/services/job_area_service.py:48,93`
- **Correção:** `raise Exception() from err` ao invés de `raise Exception()`
- **Regra ruff:** B904

---

### TASK-15 — Renomear exceções em `file_scanner.py` para sufixo `Error`
- **Arquivo:** `backend/src/application/services/file_scanner.py:14,18`
- **Correção:** `FileScanThreatFoundError`, `FileScanUnavailableError`
- **Observação:** Verificar todos os usos e atualizar junto.
- **Regra ruff:** N818

---

### TASK-16 — Substituir `getattr`/`setattr` com string literal em `pre_admission_state_machine.py`
- **Arquivo:** `backend/src/application/services/pre_admission_state_machine.py:90,92`
- **Correção:** Usar acesso direto `obj.campo = valor`
- **Regra ruff:** B009, B010

---

### TASK-17 — Remover imports não utilizados (F401) — batch
- **Arquivos afetados:** 15+ arquivos conforme ruff output
- **Correção:** Executar `ruff check --fix src tests` para auto-fix de F401
- **Risco:** Muito baixo — apenas remoção de imports mortos.

---

## PRIORIDADE RECOMENDADA

```
Sprint imediata (CRÍTICOS):
  TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06

Sprint seguinte (ALTOS — requerem investigação):
  TASK-07, TASK-08, TASK-09

Backlog médio prazo:
  TASK-10, TASK-11, TASK-13

Backlog longo prazo (requer alinhamento de contrato):
  TASK-12

Batch cosmético:
  TASK-14, TASK-15, TASK-16, TASK-17
```
