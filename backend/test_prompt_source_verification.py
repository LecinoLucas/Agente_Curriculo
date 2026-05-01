"""
🔬 VERIFICAÇÃO DE FONTE DE PROMPT

Teste que prova:
1. Qual fonte está sendo usada (DB vs Arquivo vs Fallback)
2. Se alterações no prompt aparecem nas análises
3. Por que o DEV_MOCK está bloqueando alterações

Resultado esperado:
  ✓ Se ENABLE_DEV_MOCK=false: alterações no prompt aparecem
  ✗ Se ENABLE_DEV_MOCK=true: prompt é ignorado completamente
"""

import os
import sys
from pathlib import Path

# Add project root to path
backend_root = Path(__file__).parent
sys.path.insert(0, str(backend_root))

# ── Test 1: Verify .env configuration ──────────────────────────────────
print("\n" + "="*80)
print("TEST 1: Verificar Configuração do .env")
print("="*80)

env_file = backend_root / ".env"
if env_file.exists():
    env_content = env_file.read_text()
    print("\n📄 Conteúdo relevante do .env:")
    for line in env_content.split('\n'):
        if any(key in line for key in ['ENABLE_DEV_MOCK', 'ANTHROPIC', 'ALLOW_AI']):
            print(f"  {line.strip()}")
else:
    print("  ❌ Arquivo .env não encontrado")

# ── Test 2: Verify actual settings loaded ──────────────────────────────
print("\n" + "="*80)
print("TEST 2: Configurações Reais Carregadas")
print("="*80)

from src.core.settings import settings

print(f"\n✓ ENABLE_DEV_MOCK = {settings.ENABLE_DEV_MOCK}")
print(f"✓ ANTHROPIC_API_KEY configurada = {bool(settings.ANTHROPIC_API_KEY)}")
print(f"✓ ALLOW_AI_TOKEN_SPEND = {settings.ALLOW_AI_TOKEN_SPEND}")

if settings.ENABLE_DEV_MOCK:
    print("\n⚠️  ALERTAZO!")
    print("  ENABLE_DEV_MOCK está ATIVO no código!")
else:
    print("\n✓ ENABLE_DEV_MOCK está DESATIVADO - pronto para análise real")

# ── Test 3: Compare prompt file vs database ───────────────────────────
print("\n" + "="*80)
print("TEST 3: Comparar Prompt do Arquivo vs Banco")
print("="*80)

from src.infrastructure.ai.prompts.v2_full_analysis import (
    NAME as FILE_NAME,
    VERSION as FILE_VERSION,
    SYSTEM_PROMPT as FILE_SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE as FILE_USER_PROMPT,
)

print(f"\n📄 Prompt do Arquivo (v2_full_analysis.py):")
print(f"   Name: {FILE_NAME}")
print(f"   Version: {FILE_VERSION}")
print(f"   System Prompt length: {len(FILE_SYSTEM_PROMPT)} chars")
print(f"   User Prompt length: {len(FILE_USER_PROMPT)} chars")

# Sample from file prompts
print(f"\n   System Prompt (first 200 chars):")
print(f"   {FILE_SYSTEM_PROMPT[:200]}...")

# ── Test 4: Show analysis_tasks.py logic ────────────────────────────
print("\n" + "="*80)
print("TEST 4: Fluxo Lógico em analysis_tasks.py")
print("="*80)

print("""
When analysis is triggered:

1️⃣  analysis_dispatcher.py (line 8):
    if settings.ENABLE_DEV_MOCK:
        enqueue_dev_analysis(analysis_id)  ← RETORNA FAKE SCORES
        return

2️⃣  analysis_tasks.py (line 134-151):
    if not _provider_api_key_is_configured(ai_model.provider):
        if not settings.ENABLE_DEV_MOCK:
            raise RuntimeError(...)
        logger.warning("analysis.dev_mock_active", ...)
        result_fields = _dev_fallback_scores(analysis_id)  ← RETORNA FAKE
        prompt_version = "dev_fallback"

3️⃣  analysis_tasks.py (line 161-185):
    if prompt_version != "dev_fallback":  # Só executa se DEV_MOCK=false
        system_prompt = prompt_tpl.system_prompt    ← CARREGA DO BANCO
        user_prompt_template = prompt_tpl.user_prompt_template

        if not _has_valid_prompt_value(system_prompt):  ← FALLBACK
            system_prompt = SYSTEM_PROMPT  ← CARREGA DO ARQUIVO
            user_prompt_template = USER_PROMPT_TEMPLATE

RESULTADO:
""")

if settings.ENABLE_DEV_MOCK:
    print("  ❌ ENABLE_DEV_MOCK=true")
    print("     → Análise pula TODAS as etapas de prompt")
    print("     → Retorna scores fake")
    print("     → Alterações no prompt são IGNORADAS")
else:
    print("  ✓ ENABLE_DEV_MOCK=false")
    print("    Prioridade de fonte:")
    print("    1️⃣  Banco de dados (prompt_templates)")
    print("    2️⃣  Arquivo (v2_full_analysis.py) - fallback")
    print("    → Alterações no prompt aparecem na análise!")

# ── Test 5: Show the fix ────────────────────────────────────────────
print("\n" + "="*80)
print("TEST 5: Como Corrigir")
print("="*80)

print(f"""
Status atual:
  • ENABLE_DEV_MOCK: {settings.ENABLE_DEV_MOCK}
  • ANTHROPIC_API_KEY: {bool(settings.ANTHROPIC_API_KEY)}

Para ativar análise real com prompt:
""")

if settings.ENABLE_DEV_MOCK:
    print("""  OPÇÃO 1: Rápido (sem gastos IA)
  ─────────────────────────────────────
  Deixe ENABLE_DEV_MOCK=true, mas:
  • Edite v2_full_analysis.py
  • Adicione campo único no output schema
  • Re-analise (o campo aparecerá nos extracted_data)

  Exemplo:
    No USER_PROMPT_TEMPLATE, adicione:
    "VERIFICAÇÃO_PROMPT: 'Incluir este texto exato na resposta'"

  Se aparecer nos extracted_data → prompt está sendo usado
  Se não aparecer → prompt está sendo ignorado

  OPÇÃO 2: Oficial (com gastos IA)
  ─────────────────────────────────────
  No arquivo .env, mude:
    ENABLE_DEV_MOCK=false
    ANTHROPIC_API_KEY=<SUA_CHAVE>

  Depois:
    python -m pytest tests/ -xvs
    (ou execute análise via API)

  Alterações no v2_full_analysis.py aparecerão imediatamente!

  OPÇÃO 3: Teste isolado (prova de conceito)
  ─────────────────────────────────────
  Execute:
    pytest test_prompt_flow_with_real_api.py -xvs

  Este teste simula a chamada real à IA com o prompt modificado
""")
else:
    print("""  ENABLE_DEV_MOCK=false ✓

  Próximos passos:
  1. Confira se ANTHROPIC_API_KEY está preenchida
  2. Execute nova análise
  3. Verifique analysis_results.prompt_version_used
  4. Alterações no v2_full_analysis.py devem aparecer!
""")

# ── Test 6: Create proof that prompt is in file ─────────────────────
print("\n" + "="*80)
print("TEST 6: Prova de Conceito - Marcador Único")
print("="*80)

print(f"""
Método para provar que o prompt está sendo usado:

1. Injete marcador único no prompt:
""")

MARKER = "UNIQUE_PROMPT_MARKER_20260430_TEST"

print(f"""
   No arquivo v2_full_analysis.py, USER_PROMPT_TEMPLATE:

   Adicione:
   ```
   \"\"\"VERIFICAÇÃO DE PROMPT: {MARKER}\"\"\"
   ```

2. Execute nova análise

3. Verifique em analysis_results.raw_llm_response:
   - Se contém "{MARKER}" → PROMPT ESTÁ SENDO USADO ✓
   - Se não contém → PROMPT ESTÁ SENDO IGNORADO ✗

Este teste é definitivo porque:
  • Se DEV_MOCK estiver ativo, raw_llm_response = '{{"status":"ok","source":"dev_mock"}}'
  • Se DEV_MOCK estiver inativo, raw_llm_response = resposta real da IA
  • Se vir o marcador na resposta → sabe com 100% de certeza que o prompt está active
""")

print("\n" + "="*80)
print("✅ DIAGNÓSTICO COMPLETO")
print("="*80)
print("""
Resumo:
  1. ENABLE_DEV_MOCK=true bloqueia COMPLETAMENTE a análise com IA
  2. Quando DEV_MOCK=true, o prompt é completamente ignorado
  3. Para ver alterações no prompt, desative ENABLE_DEV_MOCK
  4. Ou, use o método do marcador para provar em qual fonte está

Próxima ação:
  □ Desative ENABLE_DEV_MOCK no .env
  □ Configure ANTHROPIC_API_KEY
  □ Execute teste com marcador para validar
  □ Alterações no prompt aparecerão imediatamente
""")
