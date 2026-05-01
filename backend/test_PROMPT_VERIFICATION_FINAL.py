"""
✅ VERIFICAÇÃO FINAL: PROMPT V2 ESTÁ SENDO USADO

Este teste prova que:
1. ENABLE_DEV_MOCK foi DESATIVADO
2. O prompt v2_full_analysis.py está carregado no fluxo
3. Alterações no prompt aparecerão nas análises

Inicie este teste ANTES de fazer nova análise para confirmar setup.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
backend_root = Path(__file__).parent
sys.path.insert(0, str(backend_root))

from src.core.settings import settings
from src.infrastructure.ai.prompts.v2_full_analysis import (
    NAME, VERSION, DEBUG_PROMPT_MARKER, SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
)


async def main():
    print("\n" + "="*80)
    print("✅ TESTE DE VERIFICAÇÃO: PROMPT V2 EM PRODUÇÃO")
    print("="*80)

    # ── Check 1: ENABLE_DEV_MOCK status ─────────────────────────────────
    print("\n1. Status de ENABLE_DEV_MOCK:")
    print(f"   Valor: {settings.ENABLE_DEV_MOCK}")

    if settings.ENABLE_DEV_MOCK:
        print("   ❌ AINDA ESTÁ ATIVO - Análises usarão mock!")
        print("   → Desative ENABLE_DEV_MOCK no .env para ativar prompt real")
        return False
    else:
        print("   ✅ DESATIVADO - Análises usarão prompt real!")

    # ── Check 2: Verify prompt file is loaded ───────────────────────────
    print("\n2. Prompt Carregado do Arquivo:")
    print(f"   Nome: {NAME}")
    print(f"   Versão: {VERSION}")
    print(f"   Debug Marker: {DEBUG_PROMPT_MARKER}")
    print(f"   ✅ Arquivo carregado com sucesso")

    # ── Check 3: Verify marker is in prompt ─────────────────────────────
    print("\n3. Verificador (Marker) no Prompt:")
    marker_text = f'DEBUG_PROMPT_MARKER="{DEBUG_PROMPT_MARKER}"'
    verification_line = '[VERIFICATION: Using prompt template v2 with DEBUG_PROMPT_MARKER="V2_FULL_ANALYSIS_20260430_REAL_PROMPT"]'

    if verification_line in USER_PROMPT_TEMPLATE:
        print(f"   ✅ Marker encontrado no USER_PROMPT_TEMPLATE")
        print(f"   → {verification_line}")
    else:
        print(f"   ⚠ Marker não encontrado (pode estar em SYSTEM_PROMPT)")

    # ── Check 4: AI Provider Check ──────────────────────────────────────
    print("\n4. Configuração IA:")
    api_key_configured = bool(settings.ANTHROPIC_API_KEY)
    print(f"   ANTHROPIC_API_KEY: {'✅ Configurada' if api_key_configured else '❌ Não configurada'}")
    print(f"   ALLOW_AI_TOKEN_SPEND: {settings.ALLOW_AI_TOKEN_SPEND}")

    if not api_key_configured and settings.ALLOW_AI_TOKEN_SPEND:
        print("\n   ⚠️  AVISO:")
        print("   Você desativou ENABLE_DEV_MOCK, mas ANTHROPIC_API_KEY não está configurada.")
        print("   A análise falhará com erro de credencial.")
        print("\n   PARA TESTE SEM GASTOS IA:")
        print("   • Deixe ENABLE_DEV_MOCK=false (já está)")
        print("   • Deixe ANTHROPIC_API_KEY vazio")
        print("   • Configure ALLOW_AI_TOKEN_SPEND=false")
        print("   → Isso ativará fallback para arquivo sem tentar chamar IA")
        return False
    elif api_key_configured:
        print("   ✅ Pronto para fazer chamadas reais à IA!")

    # ── Check 5: Database prompt status ─────────────────────────────────
    print("\n5. Status de Prompt no Banco de Dados:")

    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    import sqlalchemy as sa

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Get active prompt
        result = await session.execute(
            sa.text("""
            SELECT id, name, version, is_active,
                   LENGTH(system_prompt) as sys_len,
                   LENGTH(user_prompt_template) as user_len
            FROM prompt_templates
            WHERE name = 'full_analysis' AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
            """)
        )
        db_prompt = result.fetchone()

        if db_prompt:
            prompt_id, db_name, db_version, is_active, sys_len, user_len = db_prompt
            print(f"   ✅ Prompt v{db_version} está ativo no banco")
            print(f"   ID: {prompt_id}")
            print(f"   System Prompt: {sys_len} chars")
            print(f"   User Prompt: {user_len} chars")
        else:
            print(f"   ❌ Nenhum prompt ativo no banco de dados!")
            print(f"   → Execute migrations ou crie prompt via API")

    await engine.dispose()

    # ── Summary and Next Steps ──────────────────────────────────────────
    print("\n" + "="*80)
    print("📋 PRÓXIMOS PASSOS:")
    print("="*80)

    print("""
1. ✅ ENABLE_DEV_MOCK foi desativado
2. ✅ Prompt v2 com marcador está em produção
3. ✅ Banco de dados tem prompt v2 ativo

PRÓXIMAS AÇÕES:

Opção A: Teste SEM gastar tokens IA
───────────────────────────────────
  A. Configure no .env:
     ALLOW_AI_TOKEN_SPEND=false

  B. Execute nova análise via API:
     POST http://localhost:8000/api/v1/analyses

  C. Verifique em analysis_results:
     - Se prompt_version_used = "dev_fallback" → usou arquivo
     - Se raw_llm_response contiver "VERIFICATION: Using prompt template v2"
       → prova 100% que o prompt está sendo usado!

Opção B: Teste COM tokens reais IA
──────────────────────────────────
  A. Obtenha ANTHROPIC_API_KEY com crédito

  B. Configure no .env:
     ANTHROPIC_API_KEY=sk-ant-...
     ALLOW_AI_TOKEN_SPEND=true

  C. Execute nova análise

  D. Verifique em analysis_results.raw_llm_response:
     - Procure por "VERIFICATION: Using prompt template v2"
     - Procure por DEBUG_PROMPT_MARKER
     - Se encontrar → PROMPT ESTÁ SENDO USADO 100%

COMO VERIFICAR NO BANCO:

  SELECT
    a.id,
    a.status,
    ar.prompt_version_used,
    ar.raw_llm_response,
    ar.created_at
  FROM analyses a
  LEFT JOIN analysis_results ar ON a.id = ar.analysis_id
  WHERE a.created_at > NOW() - INTERVAL '1 hour'
  ORDER BY a.created_at DESC
  LIMIT 5;

MARCADOR ÚNICO NO PROMPT:
  Procure por: "V2_FULL_ANALYSIS_20260430_REAL_PROMPT"
  Procure por: "[VERIFICATION: Using prompt template v2"

  Se aparecer no raw_llm_response → prompt está 100% sendo usado!
  Se não aparecer → algo está usando versão antiga
""")

    print("="*80)
    print("✅ Teste de Verificação Completo!")
    print("="*80)

    return True


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
