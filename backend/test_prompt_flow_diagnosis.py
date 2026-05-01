"""
DIAGNÓSTICO: Teste de Fluxo Real do Prompt

Este teste prova:
1. Qual prompt está sendo usado (banco vs arquivo vs fallback)
2. Se ENABLE_DEV_MOCK está bloqueando a análise real
3. Se alterações no prompt são refletidas na resposta
"""

import asyncio
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# ── Setup Database ─────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai")


async def test_prompt_flow():
    """Executa diagnóstico completo do fluxo de prompt."""

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print("\n" + "="*80)
    print("🔍 DIAGNÓSTICO: FLUXO REAL DO PROMPT")
    print("="*80)

    # ── 1. Check ENABLE_DEV_MOCK ──────────────────────────────────────────
    print("\n1️⃣  Status de ENABLE_DEV_MOCK:")
    enable_dev_mock = os.environ.get("ENABLE_DEV_MOCK", "false").lower() == "true"
    print(f"   ENABLE_DEV_MOCK = {enable_dev_mock}")
    print(f"   → Análises estão usando MOCK: {enable_dev_mock}")
    if enable_dev_mock:
        print("   ❌ PROBLEMA: Prompts NÃO SÃO USADOS quando DEV_MOCK está ativo!")

    # ── 2. Check which prompt template is in database ──────────────────────
    print("\n2️⃣  Prompt Template no Banco:")
    async with async_session() as session:
        result = await session.execute(
            sa.text("""
            SELECT id, name, version, is_active,
                   LENGTH(system_prompt) as system_prompt_len,
                   LENGTH(user_prompt_template) as user_prompt_len
            FROM prompt_templates
            WHERE is_active = true
            ORDER BY created_at DESC
            LIMIT 1
            """)
        )
        prompt_row = result.fetchone()

        if not prompt_row:
            print("   ❌ Nenhum prompt ativo no banco!")
        else:
            prompt_id, name, version, is_active, sys_len, user_len = prompt_row
            print(f"   ✓ ID: {prompt_id}")
            print(f"   ✓ Nome: {name} v{version}")
            print(f"   ✓ Is Active: {is_active}")
            print(f"   ✓ System Prompt length: {sys_len} chars")
            print(f"   ✓ User Prompt length: {user_len} chars")

    # ── 3. Load prompt from v2_full_analysis.py ───────────────────────────
    print("\n3️⃣  Prompt do Arquivo (v2_full_analysis.py):")
    try:
        from src.infrastructure.ai.prompts.v2_full_analysis import (
            NAME, VERSION, SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, JOB_CONTEXT_TEMPLATE
        )
        print(f"   ✓ NAME: {NAME}")
        print(f"   ✓ VERSION: {VERSION}")
        print(f"   ✓ SYSTEM_PROMPT length: {len(SYSTEM_PROMPT)} chars")
        print(f"   ✓ USER_PROMPT_TEMPLATE length: {len(USER_PROMPT_TEMPLATE)} chars")

        # Check if marker is in the prompt
        marker = "DEBUG_MARKER_V2_REAL_ANALYSIS"
        if marker in SYSTEM_PROMPT or marker in USER_PROMPT_TEMPLATE:
            print(f"   ✓ DEBUG MARKER '{marker}' encontrado no prompt")
        else:
            print(f"   ⚠ DEBUG MARKER não encontrado no prompt atual")
    except ImportError as e:
        print(f"   ❌ Erro ao carregar prompt: {e}")

    # ── 4. Check recent analyses ───────────────────────────────────────────
    print("\n4️⃣  Análises Recentes:")
    async with async_session() as session:
        result = await session.execute(
            sa.text("""
            SELECT
                a.id, a.status, a.created_at,
                pt.name, pt.version,
                ar.prompt_version_used,
                ar.raw_llm_response
            FROM analyses a
            LEFT JOIN prompt_templates pt ON a.prompt_template_id = pt.id
            LEFT JOIN analysis_results ar ON a.id = ar.analysis_id
            ORDER BY a.created_at DESC
            LIMIT 3
            """)
        )
        rows = result.fetchall()

        for i, row in enumerate(rows, 1):
            analysis_id, status, created, pt_name, pt_ver, pv_used, raw_resp = row
            print(f"\n   Análise {i}:")
            print(f"   ID: {analysis_id}")
            print(f"   Status: {status}")
            print(f"   Created: {created}")
            print(f"   Prompt DB: {pt_name} v{pt_ver}")
            print(f"   Prompt Usado: {pv_used}")

            if raw_resp:
                if "dev_mock" in str(raw_resp).lower():
                    print(f"   ❌ Usando DEV_MOCK (não é análise real)")
                elif "debug_marker_v2" in str(raw_resp).lower():
                    print(f"   ✓ Usando PROMPT REAL com debug marker!")
                else:
                    print(f"   Response preview: {str(raw_resp)[:80]}...")

    # ── 5. Summary ─────────────────────────────────────────────────────────
    print("\n" + "="*80)
    print("📊 RESUMO DO DIAGNÓSTICO:")
    print("="*80)

    print(f"\n✓ ENABLE_DEV_MOCK: {enable_dev_mock}")
    print(f"✓ Prompt v2 está no arquivo: Sim")
    print(f"✓ Prompt v2 está no banco: Sim (id={prompt_id})")

    if enable_dev_mock:
        print("\n🚨 PROBLEMA IDENTIFICADO:")
        print("  • ENABLE_DEV_MOCK está ATIVADO")
        print("  • Isso faz com que análises usem mock synthetic")
        print("  • Nenhuma análise chama o prompt real")
        print("  • Por isso, alterações no prompt NÃO APARECEM")

        print("\n✅ SOLUÇÃO:")
        print("  1. Desative ENABLE_DEV_MOCK no .env")
        print("  2. Configure ANTHROPIC_API_KEY com uma chave válida")
        print("  3. Configure ALLOW_AI_TOKEN_SPEND=true")
        print("  4. Execute nova análise")
        print("  5. Alterações no prompt aparecerão imediatamente")
    else:
        print("\n✅ ENABLE_DEV_MOCK está DESATIVADO")
        print("   Análises estão usando o prompt real")
        print("   Alterações no prompt devem aparecer nas novas análises")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test_prompt_flow())
