# AI-AUDIT-1 — Recomendação de Próxima Fase

**Data:** 2026-06-06  
**Status da auditoria:** Concluída — 216/216 testes AI passando, 0 riscos críticos

---

## Estado atual (pós AI-RAG-11)

O backend está funcionalmente completo para a capacidade de **busca e resposta baseada em conhecimento**:

| Capacidade | Status |
|------------|--------|
| Ingestão de documentos | ✅ Implementado e testado |
| Chunking determinístico | ✅ Implementado e testado |
| Embeddings fake (dev/test) | ✅ Funcionando |
| Embeddings Gemini (prod) | ✅ Feature-flagged, desligado por default |
| Busca vetorial pgvector | ✅ Com fallback json |
| `knowledge.search` via assistant | ✅ Commitado e testado |
| `knowledge.answer` com síntese | ✅ Commitado e testado |
| Síntese Gemini | ✅ Feature-flagged, desligado por default |
| AssistantRouter determinístico | ✅ 19 tools registradas |
| Permissões por role | ✅ Com 2 gaps documentados |

---

## Recomendação

**Fase recomendada: AI-AUDIT-1-FIXES — Correções de hardening antes de qualquer expansão**

**Antes de avançar para UI, chat livre ou multi-agent**, dois riscos HIGH devem ser corrigidos:

### Por quê corrigir agora

1. **H-01 (redação de CPF/email na síntese)** e **H-02 (API key em logs)** somente se materializam quando `RAG_SYNTHESIS_ENABLED=True`. Hoje o risco é latente mas zero em produção. Porém, a habilitação da síntese é o pré-requisito natural de qualquer UI de chat ou assistente conversacional. Corrigir antes de habilitar tem custo baixo (2 linhas de código + 1 teste cada) e elimina o risco completamente.

2. As correções de hardening (T-01 a T-08) têm **escopo mínimo e não alteram regras de negócio**. Podem ser feitas em uma sessão de trabalho.

3. A decisão sobre **M-01 (VIEWER no assistente)** requer apenas uma decisão de design + 1 linha de código. Sem ela, o comportamento é ambíguo.

---

## Sequência recomendada

```
AGORA (antes de expandir):
  └─► AI-AUDIT-1-FIXES
        T-01: redact_ai_response_text em rag_answer_service.py
        T-02: sanitize_log_text em network errors dos providers Gemini  
        T-05: Corrigir docstring registry.py ("19 total")
        T-08: Remover variável i não usada em embed_texts
        Decisão sobre T-03 (VIEWER no assistente)
        git push origin save/behavioral-ai-and-wips (T-09)

DEPOIS (próxima fase de feature):
  └─► Escolher UM dos seguintes, por prioridade de valor:

    OPÇÃO A — AI-UI-1: Interface de Assistente no Frontend
      Contexto: Backend "fala" com fontes desde AI-RAG-11.
      O que falta: Component de chat no frontend, exibição de sources,
                   estado de loading, integração com endpoint read-only.
      Dependência: AI-AUDIT-1-FIXES concluído.
      Recomendação: Começar por aqui se a necessidade for validar o produto.

    OPÇÃO B — AI-RAG-12: Ingestão automática via admin panel
      Contexto: Hoje a ingestão é feita via script/API diretamente.
      O que falta: UI de upload de documentos para a knowledge base,
                   status de ingestão, validação de tipos de documento.
      Dependência: AI-AUDIT-1-FIXES + T-10 (sanitização anti-injection).
      Recomendação: Se o foco for popular a base de conhecimento.

    OPÇÃO C — AI-CONV-1: Memória de conversa (session history)
      Contexto: Cada request é stateless; o assistente não lembra perguntas anteriores.
      O que falta: Persistência de histórico por session_id, 
                   injeção de contexto nas requests subsequentes.
      Dependência: AI-AUDIT-1-FIXES.
      Recomendação: Se o foco for melhorar a UX do assistente.

    OPÇÃO D — AI-MULTI-1: Multi-agent (supervisor + agentes especializados)
      Contexto: Os agentes por domínio (job_agent, candidate_agent, etc.) existem
                em `/agents/` mas não estão conectados ao AssistantRouter.
      O que falta: Supervisor routing, handoff, state sharing.
      Dependência: AI-AUDIT-1-FIXES + AI-UI-1 (validação de UX básica primeiro).
      Recomendação: Adiar. Alta complexidade, baixo valor incremental enquanto
                    a UI não estiver validada com usuários.
```

---

## Critérios de aceite para a próxima feature phase

Qualquer expansão de feature (UI, multi-agent, conversa livre) deve atender:

1. **AI-AUDIT-1-FIXES concluído** — todos os P0 e P1 do TASKS.md
2. **Testes AI**: 100% dos 216 testes atuais passando + novos testes de T-01/T-02
3. **Flag de síntese**: `RAG_SYNTHESIS_ENABLED=False` em dev, habilitada apenas em staging controlado após T-01/T-02
4. **Git**: branch publicada (`git push`) antes de abrir PR
5. **Sem novas migrations**: qualquer schema change requer revisão separada

---

## O que NÃO fazer agora

| Caminho | Por quê não |
|---------|------------|
| Habilitar `RAG_SYNTHESIS_ENABLED=True` em produção | H-01 e H-02 não resolvidos |
| Criar UI de chat sem corrigir H-01 | A UI exibiria respostas sem redação |
| Avançar para multi-agent | Complexidade prematura; UX básica não validada |
| Criar novas features ignorando os 3 failing unit tests pré-existentes | Debt acumula |
| Conectar knowledge.answer a texto livre sem intenção estruturada | Expande superfície de ataque antes do hardening |
