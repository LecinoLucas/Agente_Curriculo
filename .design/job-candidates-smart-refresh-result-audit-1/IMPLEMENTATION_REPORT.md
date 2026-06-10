# JOB-CANDIDATES-SMART-REFRESH-RESULT-AUDIT-1

Data: 2026-06-10

---

## Problema identificado

Após executar "Atualizar candidatos" em uma vaga com 19 candidatos, o modal mostrava:
- **18** para "ranking sem IA"
- **1** para "análise IA"

Na prática, a maioria desses 18 candidatos precisava de reprocessamento manual individual — a análise estava com `status=completed` mas o campo `extracted_data` estava vazio (`{}`). O `_classify()` do use case os colocava em `ranking_recalculation` sem verificar se havia dados utilizáveis.

---

## Causa raiz

`_classify()` em `smart_refresh_use_case.py`:

```python
# ANTES (bug):
if row.analysis_status == "completed":
    return "ranking_recalculation"  # sem verificar extracted_data
```

Candidatos com `analysis_status=completed` mas `analysis_results.extracted_data = {}` eram classificados como `ranking_recalculation`. O recálculo de ranking usava dados vazios, produzindo scores inválidos sem aviso.

---

## Correção implementada

### Backend: `smart_refresh_use_case.py`

1. **`_CandidateRow`** ganhou dois campos:
   - `candidate_name: str` — para amostras/debug
   - `has_extracted_data: bool` — True somente quando existe linha em `analysis_results` E `extracted_data != {}`

2. **`_classify()`** agora retorna `tuple[str, str]` (categoria, motivo):
   ```python
   if row.analysis_status == "completed":
       if not row.has_extracted_data:
           return "ai_analysis", "legacy_incomplete_analysis"  # CORRIGIDO
       return "ranking_recalculation", ""
   ```

3. **`_fetch_candidate_rows()`** expandida:
   - JOIN com `CandidateModel` para obter `full_name`
   - EXISTS correlated subquery sobre `AnalysisResultModel` verificando `CAST(extracted_data AS TEXT) != '{}'`

4. **`SmartRefreshPreviewData`** ganhou:
   - `ai_analysis_legacy_incomplete_count: int` — subconjunto de `ai_analysis`
   - `samples_ai: list[_SampleEntry]` — até 10 amostras (id, nome, motivo) para debug
   - `samples_skipped: list[_SampleEntry]`

5. **`SmartRefreshExecuteData`** ganhou:
   - `skipped_legacy_incomplete: int` — candidatos redispatchados como ai_analysis com motivo legacy

6. **Warnings** geradas automaticamente:
   - Se `legacy_incomplete > 0`: `"N candidato(s) com análise completada mas dados insuficientes serão reenviados para análise IA."`
   - Sempre: `"A atualização é enfileirada e pode levar alguns instantes."`

7. **`message` do execute** agora inclui contagens detalhadas:
   - Ex: `"Atualização enfileirada: 2 ranking sem IA, 17 análise IA, 1 ignorados."`

### Backend: `ranking_schemas.py`

- `SmartRefreshSkipReason`: campo `description: str = ""` adicionado
- `_SmartRefreshSampleEntry` e `_SmartRefreshSamples` adicionados
- `SmartRefreshPreviewResponse.samples` adicionado (default vazio)
- `SmartRefreshExecuteResponse.skipped_legacy_incomplete: int = 0` adicionado

### Backend: `routers/jobs.py`

- `smart_refresh_preview`: skip reasons com `description`, cálculo de `ai_description` com contagem legacy, construção de `samples`, campo `samples` na resposta
- `smart_refresh_execute`: `skipped_legacy_incomplete` passado para a resposta

### Frontend: `SmartRefreshModal.tsx`

1. Botão "Confirmar" → **"Iniciar atualização"**
2. "Ignorados" sempre visível (antes: apenas quando count > 0)
3. Sub-lista de motivos (`already_processing`, `no_resume`) com descrição quando presente
4. Cor de aviso (warning) no count de "Análise IA" quando > 0
5. Warnings do backend sempre exibidos (incluindo legacy_incomplete e async notice)
6. Texto descritivo do modal atualizado para ser mais preciso

### Frontend: `jobsService.ts`

- `SmartRefreshSkipReason`: `description?: string`
- `SmartRefreshSampleEntry` type adicionado
- `SmartRefreshPreview.samples?` adicionado
- `SmartRefreshResult.skipped_legacy_incomplete?: number` adicionado

---

## Resultado esperado para o caso real (19 candidatos)

**Antes da correção:**
```
ranking_recalculation: 18   ← errado (candidatos com extracted_data vazio)
ai_analysis:            1
skipped:                0
```

**Depois da correção:**
```
ranking_recalculation:  2   ← somente candidatos com dados completos
ai_analysis:           17   ← inclui 16 legacy_incomplete
skipped:                0

warnings:
  "16 candidato(s) com análise completada mas dados insuficientes serão reenviados para análise IA."
  "A atualização é enfileirada e pode levar alguns instantes."
```

---

## Testes

### Backend: `tests/unit/test_smart_refresh_use_case.py`

Testes adicionados/atualizados (38 total, eram 28):
- `P2`: renomeado para `test_p2_completed_with_valid_data_is_ranking_recalculation`
- `P2b`: completed + empty `extracted_data` → `ai_analysis` (legacy_incomplete_analysis)
- `P8`: `ai_analysis_legacy_incomplete_count` rastreado separadamente
- `P9`: warning de legacy_incomplete gerado quando count > 0
- `P10`: warning de enfileiramento sempre presente
- `E6`: renomeado para `test_e6_completed_with_valid_data_not_re_dispatched_to_ai`
- `E8`: legacy_incomplete redispatchado para AI e contado em `skipped_legacy_incomplete`
- `test_message_contains_counts`: mensagem inclui contagens

### Frontend: `SmartRefreshModal.test.tsx` (novo — 12 testes)

- Renders all four count rows regardless of values
- Shows Ignorados row even when skipped count is 0
- Shows skip reason breakdown when reasons are present
- Shows skip reason description when provided
- Shows IA cost warning color when ai_analysis count > 0
- Does not apply warning color when count is 0
- Shows all warnings from preview
- Shows 'Iniciar atualização' as confirm button label
- Shows 'Atualizando...' when executing
- Shows 'Carregando prévia...' when previewLoading
- Disables buttons while loading
- Returns null when not open

---

## Escopo preservado

- Sem alteração ao algoritmo de scoring
- Sem alteração ao Gemini/prompt/provider
- Sem migration de banco de dados
- Sem alteração ao PipelinePage
- Sem alteração a tema/navbar/Protheus/bot
- Sem git add . / sem commit
