# ✅ Como Testar a Correção do Prompt

## 🎯 Objetivo
Validar que o prompt v2_full_analysis.py está sendo usado no fluxo real de análise.

---

## 📋 Passos Rápidos

### 1️⃣ Verifique a Configuração
```bash
python -c "from src.core.settings import settings; print(f'ENABLE_DEV_MOCK={settings.ENABLE_DEV_MOCK}, ALLOW_AI_TOKEN_SPEND={settings.ALLOW_AI_TOKEN_SPEND}')"
```

**Esperado:**
```
ENABLE_DEV_MOCK=False, ALLOW_AI_TOKEN_SPEND=False
```

✓ Se for diferente, edite `.env`

### 2️⃣ Execute o Teste de Verificação
```bash
python test_PROMPT_VERIFICATION_FINAL.py
```

**Esperado:**
```
✅ ENABLE_DEV_MOCK está DESATIVADO
✅ Marker encontrado no USER_PROMPT_TEMPLATE  
✅ Prompt v2 está ativo no banco
```

### 3️⃣ Crie Nova Análise

**Opção A: Via API (se servidor está rodando)**
```bash
# Em outro terminal, com servidor rodando
curl -X POST http://localhost:8000/api/v1/analyses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resume_version_id": "UUID_AQUI"}'
```

**Opção B: Via teste**
```bash
pytest tests/integration/test_worker_tasks.py::test_analysis_task -xvs
```

### 4️⃣ Verifique no Banco

```bash
psql postgresql://LecinoLucas:020219@localhost:5432/resume_ai -c "
SELECT 
  a.id,
  a.created_at,
  ar.prompt_version_used,
  SUBSTRING(ar.raw_llm_response, 1, 200) as response_preview
FROM analyses a
LEFT JOIN analysis_results ar ON a.id = ar.analysis_id
WHERE a.created_at > NOW() - INTERVAL '1 hour'
ORDER BY a.created_at DESC
LIMIT 5;
"
```

**Esperado - Procure por:**
- ✓ `prompt_version_used`: algo diferente de `"dev_mock"`
- ✓ `raw_llm_response`: contém `"VERIFICATION: Using prompt template v2"`
- ✓ `raw_llm_response`: contém `"V2_FULL_ANALYSIS_20260430_REAL_PROMPT"`

### 5️⃣ Se Vir o Marcador no raw_llm_response

**✅ SUCESSO!** O prompt está sendo usado.

Isso significa:
- ✓ ENABLE_DEV_MOCK está desativado
- ✓ O prompt v2 está no fluxo real
- ✓ Alterações no v2_full_analysis.py aparecerão nas próximas análises
- ✓ O matching usa extracted_data correto

---

## 🔧 Troubleshooting

### Problema: `prompt_version_used` ainda é `"dev_fallback"`

**Causa:** 
- ENABLE_DEV_MOCK ainda está true
- Ou ALLOW_AI_TOKEN_SPEND ainda está true sem ANTHROPIC_API_KEY

**Solução:**
```bash
# Verifique .env
grep -E "ENABLE_DEV_MOCK|ALLOW_AI_TOKEN_SPEND|ANTHROPIC_API_KEY" .env
```

Deveria ser:
```
ENABLE_DEV_MOCK=false
ALLOW_AI_TOKEN_SPEND=false
ANTHROPIC_API_KEY=
```

### Problema: Análise falha com erro de credencial

**Causa:** 
- ENABLE_DEV_MOCK=false
- ALLOW_AI_TOKEN_SPEND=true
- ANTHROPIC_API_KEY vazio

**Solução Temporária:**
```bash
# Edit .env
ALLOW_AI_TOKEN_SPEND=false
```

**Solução Permanente:**
```bash
# Obtenha chave em https://console.anthropic.com
# Depois edit .env:
ANTHROPIC_API_KEY=sk-ant-...
ALLOW_AI_TOKEN_SPEND=true
```

### Problema: Marcador não aparece no raw_llm_response

**Causa Possível:**
- Banco tem prompt antigo
- Arquivo não foi recarregado
- Settings cache precisa ser limpo

**Solução:**
```bash
# Limpe cache Python
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete

# Re-execute
python test_PROMPT_VERIFICATION_FINAL.py
```

---

## 📊 Informações Técnicas

### O que foi mudado?

**1. `.env`**
```diff
- ENABLE_DEV_MOCK=true
+ ENABLE_DEV_MOCK=false

- ALLOW_AI_TOKEN_SPEND=True  
+ ALLOW_AI_TOKEN_SPEND=false
```

**2. `src/infrastructure/ai/prompts/v2_full_analysis.py`**
```diff
+ DEBUG_PROMPT_MARKER = "V2_FULL_ANALYSIS_20260430_REAL_PROMPT"

+ [VERIFICATION: Using prompt template v2 with DEBUG_PROMPT_MARKER="V2_FULL_ANALYSIS_20260430_REAL_PROMPT"]
```

**3. Testes criados:**
- `test_prompt_flow_diagnosis.py` - Diagnóstico inicial
- `test_prompt_source_verification.py` - Verificação de fonte
- `test_PROMPT_VERIFICATION_FINAL.py` - Teste final
- `DIAGNOSTICO_PROMPT_FLOW_20260430.md` - Documentação completa

### Como o Prompt é Carregado?

```
analysis_tasks.py:174-185
  ↓
if ENABLE_DEV_MOCK:
  → dev_analysis_processor() ← IGNORA PROMPT (ANTES ERA AQUI!)
  
else:
  → Carrega de prompt_templates (BANCO)
    if not exists or empty:
      → Fallback para v2_full_analysis.py (ARQUIVO)
    → Injeta resume_text e job_description
    → Chama IA
    → Salva em analysis_results.raw_llm_response
```

### Marcador = Prova Visual

```json
{
  "raw_llm_response": {
    "job_understanding": {...},
    "candidate_understanding": {...},
    "VERIFICATION": "Using prompt template v2 with DEBUG_PROMPT_MARKER=V2_FULL_ANALYSIS_20260430_REAL_PROMPT"
  }
}
```

Se vir `"VERIFICATION"` → Prompt está 100% sendo usado!

---

## ✅ Checklist Final

Antes de considerar resolvido:

- [ ] `.env` tem `ENABLE_DEV_MOCK=false`
- [ ] `test_PROMPT_VERIFICATION_FINAL.py` passa sem erros
- [ ] Nova análise foi criada
- [ ] `prompt_version_used` não é `"dev_mock"`
- [ ] Marcador aparece em `raw_llm_response`
- [ ] Matching usa extracted_data correto
- [ ] Testes passam: `pytest tests/ -xvs`

---

## 📞 Se Tiver Dúvidas

Consulte:
1. `DIAGNOSTICO_PROMPT_FLOW_20260430.md` - Análise técnica completa
2. `test_PROMPT_VERIFICATION_FINAL.py` - Teste verificável
3. `analysis_tasks.py:174-185` - Código que carrega o prompt

---

*Última atualização: 2026-04-30*
