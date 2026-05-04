# Auditoria e Limpeza de Candidate Job Links Órfãos

**Data:** 2026-05-03  
**Status:** ✅ Concluído

## Objetivo

Auditar e neutralizar `candidate_job_links` inconsistentes que violam a regra de negócio fundamental:

> **"Pipeline ativo é a única fonte de verdade para vagas atuais"**

## Regra Violada

Um `candidate_job_link` com:
- `status = 'active'`
- `deleted_at IS NULL` (não soft-deletado)

**DEVE** ter um correspondente `candidate_pipeline` com:
- `candidate_id` = mesmo candidato
- `job_id` = mesma vaga  
- `is_active = true`

Links que não obedecem esta regra são **"órfãos"** e devem ser neutralizados.

## Entrega

### 1. Scripts de Auditoria e Limpeza

#### `backend/scripts/audit_orphaned_candidate_job_links.py`
Script que **encontra e relata** links órfãos sem alterar dados.

**Uso:**
```bash
cd backend
source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://user:pass@host/db" python3 scripts/audit_orphaned_candidate_job_links.py
```

**Saída:**
```
================================================================================
AUDITORIA: candidate_job_links órfãs (sem pipeline ativo correspondente)
================================================================================

Total de active links (deleted_at IS NULL): 4

Estatísticas de links órfãos:

TOTAL ÓRFÃOS: 0

✅ Nenhum link órfão encontrado! Sistema está consistente.
```

#### `backend/scripts/cleanup_orphaned_candidate_job_links.py`
Script que **marca links órfãos como 'transferred'** de forma segura e reversível.

**Modo DRY RUN (padrão):**
```bash
DATABASE_URL="postgresql+asyncpg://user:pass@host/db" python3 scripts/cleanup_orphaned_candidate_job_links.py
```

**Modo EXECUTAR:**
```bash
DATABASE_URL="postgresql+asyncpg://user:pass@host/db" python3 scripts/cleanup_orphaned_candidate_job_links.py --execute
```

**Saída (modo dry-run):**
```
================================================================================
LIMPEZA: candidate_job_links órfãs
Modo: DRY RUN (sem alterações)
================================================================================

✅ Nenhuma limpeza necessária. Sistema está consistente.
   Total de links active: 0 órfãos encontrados
```

### 2. Migration Alembic

**Arquivo:** `backend/alembic/versions/11559b342fc9_cleanup_orphaned_candidate_job_links.py`

**O que faz:**
- `upgrade()`: Marca todos os links órfãos como `'transferred'` (não-destrutivo)
- `downgrade()`: Reverte mudança (reversível)

**Execução automática** com `alembic upgrade head`.

### 3. Testes de Validação

**Arquivo:** `backend/tests/integration/test_orphaned_candidate_job_link_invariant.py`

**6 testes implementados:**

1. ✅ `test_orphaned_link_detection_query` - Query de detecção funciona
2. ✅ `test_cleanup_query_identifies_correct_links` - Query de limpeza alvo certo
3. ✅ `test_query_respects_status_check` - Apenas `status='active'` é verificado
4. ✅ `test_query_respects_deleted_at_check` - Soft-deleted (`deleted_at IS NOT NULL`) excluídos
5. ✅ `test_invariant_preserved_by_pipeline_active_flag` - `is_active` é respeitado
6. ✅ `test_migration_down_reverses_changes` - Downgrade funciona

**Executar:**
```bash
pytest tests/integration/test_orphaned_candidate_job_link_invariant.py -v
# 6 passed ✅
```

## Resultados da Auditoria

### Status Atual do Sistema (2026-05-03)

```
Total de candidate_job_links ativos (status='active', deleted_at IS NULL): 4
Total de links órfãos encontrados: 0

✅ SISTEMA CONSISTENTE - Nenhuma limpeza necessária
```

### O que foi verificado

- ✅ Query de detecção de órfãos funciona corretamente
- ✅ Apenas links com `status='active'` são verificados
- ✅ Links soft-deletados (`deleted_at IS NOT NULL`) são excluídos
- ✅ Pipeline `is_active=false` conta como pipeline inativo
- ✅ Pipeline ausente (`NULL`) conta como orphaned
- ✅ Migration upgrade/downgrade é reversível

## Segurança e Reversibilidade

| Aspecto | Implementação |
|---------|---|
| **Destrutividade** | ❌ Não-destrutivo: marca como `'transferred'`, não deleta |
| **Reversibilidade** | ✅ Status pode ser alterado de volta a `'active'` |
| **Soft-delete** | ✅ `deleted_at` permanece `NULL` (não é soft-deletado) |
| **Auditoria** | ✅ `updated_at` é atualizado (rastreabilidade) |

## Invariante Garantida

Após aplicar a migration ou cleanup:
- Todos os `candidate_job_links` com `status='active'` e `deleted_at IS NULL` **terão** um `candidate_pipeline` correspondente com `is_active=true`
- Ou o link foi marcado como `'transferred'` (neutralizado)

## Como Usar em Produção

### 1. Auditoria Inicial
```bash
# Verificar se há órfãos antes de fazer qualquer coisa
python3 scripts/audit_orphaned_candidate_job_links.py
```

### 2. Dry Run
```bash
# Simular a limpeza sem alterar dados
python3 scripts/cleanup_orphaned_candidate_job_links.py
```

### 3. Executar Limpeza (Opção A: via Script)
```bash
# Executar a limpeza via script
python3 scripts/cleanup_orphaned_candidate_job_links.py --execute
```

### 4. Executar Limpeza (Opção B: via Migration)
```bash
# Executar via alembic
alembic upgrade 11559b342fc9
```

### 5. Verificar Após Limpeza
```bash
# Confirmar que não há mais órfãos
python3 scripts/audit_orphaned_candidate_job_links.py
```

## Queries de Referência

### Query de Detecção de Órfãos
```sql
SELECT
    cjl.id,
    cjl.candidate_id,
    cjl.job_id,
    cjl.status,
    cjl.source,
    cjl.created_at,
    CASE WHEN cp.is_active IS NULL THEN 'NO PIPELINE'
         WHEN cp.is_active = false THEN 'PIPELINE INACTIVE'
         ELSE 'PIPELINE ACTIVE'
    END as pipeline_status
FROM candidate_job_links cjl
LEFT JOIN candidate_pipeline cp
    ON cjl.candidate_id = cp.candidate_id
    AND cjl.job_id = cp.job_id
WHERE cjl.status = 'active'
  AND cjl.deleted_at IS NULL
  AND (cp.is_active IS NULL OR cp.is_active = false)
ORDER BY cjl.created_at DESC;
```

### Query de Limpeza
```sql
UPDATE candidate_job_links
SET status = 'transferred', updated_at = NOW()
WHERE id IN (
    SELECT cjl.id
    FROM candidate_job_links cjl
    LEFT JOIN candidate_pipeline cp
        ON cjl.candidate_id = cp.candidate_id
        AND cjl.job_id = cp.job_id
    WHERE cjl.status = 'active'
      AND cjl.deleted_at IS NULL
      AND (cp.is_active IS NULL OR cp.is_active = false)
);
```

## Próximas Melhorias

1. **Alertas**: Adicionar check de invariante em `INSERT/UPDATE` de `candidate_job_links`
2. **Constraint**: Considerar adicionar trigger que impeça inserção de links órfãos
3. **Cleanup automático**: Scheduler que executa auditoria periodicamente
4. **Documentação**: Adicionar à runbook de operações

## Referências

- **Rule Master Document:** `agents.md`
- **Migration History:** `alembic/versions/`
- **Tests:** `tests/integration/test_orphaned_candidate_job_link_invariant.py`
- **Phase 4 Complete:** `phase4_complete_services_migration.md`
