# AI-AUDIT-1 — TASKS de Correção Priorizadas

**Data:** 2026-06-06  
**Origem:** AUDIT_REPORT.md + RISK_REGISTER.md  
**Escopo:** Apenas correções — sem features novas

---

## Prioridade P0 — Deve corrigir antes de habilitar RAG_SYNTHESIS_ENABLED=True

### T-01 · Aplicar `redact_ai_response_text` na resposta de síntese RAG

**Risco:** H-01  
**Arquivo:** `backend/src/ai_orchestration/rag/rag_answer_service.py`

```python
# Importar no topo:
from src.core.ai_response_redactor import redact_ai_response_text

# Em synthesize_answer(), após receive answer_text do provider:
answer_text = redact_ai_response_text(answer_text) or answer_text
```

**Teste a adicionar:** `test_ai_rag_answer_service.py`
- Cenário: provider retorna texto com CPF `"123.456.789-00"` → resultado não contém CPF

---

### T-02 · Sanitizar URL/mensagem de `httpx.RequestError` em Gemini providers antes de propagar

**Risco:** H-02  
**Arquivos:**
- `backend/src/ai_orchestration/rag/gemini_rag_synthesis_provider.py`
- `backend/src/ai_orchestration/rag/gemini_embedding_provider.py`

```python
from src.core.log_sanitizer import sanitize_log_text

# Substituir:
raise RuntimeError(f"Network error calling Gemini ... API: {exc}")
# Por:
raise RuntimeError(f"Network error calling Gemini ... API: {sanitize_log_text(str(exc))}")
```

**Teste a adicionar:** Verificar que RuntimeError não contém padrões de API key (`AIza...`).

---

## Prioridade P1 — Importante para governança

### T-03 · Definir comportamento intencional do VIEWER no assistente

**Risco:** M-01  
**Arquivo:** `backend/src/interface/api/routers/ai_assistant.py`

**Opção A** — VIEWER não deve acessar o assistente:
```python
# No endpoint, antes do handle():
if "can_use_assistant" not in agent_ctx.permissions:
    raise HTTPException(status_code=403, detail="Assistente não disponível para este role.")
```

**Opção B** — VIEWER pode acessar apenas job tools (comportamento atual, mas intencional):
Documentar explicitamente nos comentários de `_ROLE_PERMISSIONS`.

**Decisão:** Requer validação com product owner.

---

### T-04 · Adicionar logging estruturado de execução no ToolRuntime

**Risco:** L-04 (Low mas impacta auditoria/rastreabilidade)  
**Arquivo:** `backend/src/ai_orchestration/core/tool_runtime.py`

Emitir log após execução de cada tool:
```python
import logging, time
logger = logging.getLogger(__name__)

# Em execute(), após chamada a tool_def.fn():
logger.info(
    "ai_tool_executed",
    extra={
        "tool": tool_name,
        "ok": result.ok,
        "error_code": result.error_code,
        "user_id": agent_ctx.user_id,
        "request_id": execution_context.agent_context.request_id,
        "session_id": execution_context.agent_context.session_id,
    }
)
```

---

### T-05 · Corrigir docstring de registry.py

**Risco:** L-01  
**Arquivo:** `backend/src/ai_orchestration/tools/registry.py`

```python
# Linha 4 — de:
#   Tools registradas (17 total, todas read_only=True, requires_approval=False):
# Para:
#   Tools registradas (19 total, todas read_only=True, requires_approval=False):
#
#   Knowledge (2):
#     search_knowledge, answer_knowledge
```

---

## Prioridade P2 — Melhorias de hardening

### T-06 · Sanitizar mensagem de ValidationException em protheus_tools

**Risco:** M-04  
**Arquivo:** `backend/src/ai_orchestration/tools/protheus_tools.py`

```python
# De:
return ToolResult.error("NOT_FOUND", 
    f"Pacote de exportação '{package_id}' não encontrado ou inválido: {exc}")
# Para:
logger.warning(f"Protheus package not found: {exc}", extra={"package_id": package_id})
return ToolResult.error("NOT_FOUND", f"Pacote de exportação '{package_id}' não encontrado.")
```

---

### T-07 · Sanitizar mensagem de exception em TextIngestionService

**Risco:** M-05  
**Arquivo:** `backend/src/ai_orchestration/rag/ingestion_service.py`

```python
# De:
error=f"repository_error: {exc}"
# Para:
error=f"repository_error: {type(exc).__name__}"
```

Logar `exc` internamente com `logger.error()`.

---

### T-08 · Fixar variável não utilizada `i` em embed_texts

**Risco:** L-07  
**Arquivo:** `backend/src/ai_orchestration/rag/gemini_embedding_provider.py`

```python
# De:
vectors = [emb["values"] for i, emb in enumerate(embeddings)]
# Para:
vectors = [emb["values"] for emb in embeddings]
```

---

### T-09 · Push dos commits locais para origin

**Risco:** L-05  
**Ação:** `git push origin save/behavioral-ai-and-wips`  
**Pré-condição:** Verificar se CI está configurado para a branch antes de habilitar push.

---

## Prioridade P3 — Backlog de segurança

### T-10 · Implementar sanitização de documentos na ingestão (anti-injection)

**Risco:** M-02  
**Arquivo:** `backend/src/ai_orchestration/rag/ingestion_service.py`

Adicionar etapa pré-chunking para remover padrões de prompt injection:
```python
INJECTION_PATTERNS = [
    re.compile(r"<SYSTEM>.*?</SYSTEM>", re.DOTALL | re.IGNORECASE),
    re.compile(r"###\s*Instructions?:", re.IGNORECASE),
    re.compile(r"\[SYSTEM\].*?\[/SYSTEM\]", re.DOTALL),
]
```

---

### T-11 · Definir política de sanitização de conteúdo de chunk antes do LLM

**Risco:** M-03  
**Arquivo:** `backend/src/ai_orchestration/rag/rag_answer_service.py`

Opções:
- Validar na ingestão que documentos do tipo `pre_admission_docs` não contêm CPF
- Adicionar sanitização de CPF/email/telefone no `content` antes do prompt
- Documentar explicitamente os tipos de source_type permitidos e suas garantias

---

### T-12 · Implementar rate limiting no endpoint do assistente

**Risco:** L-06  
**Arquivo:** `backend/src/interface/api/routers/ai_assistant.py`

Conforme SECURITY_AND_GOVERNANCE.md (50 mensagens/sessão, 5 sessões/hora). Usar Redis para contagem de sessões existente no projeto.

---

### T-13 · Lazy instantiation de serviços em `_build_services`

**Risco:** L-02  
**Arquivo:** `backend/src/interface/api/routers/ai_assistant.py`

Considerar lazy loading ou factory por domínio para não criar retriever/answer_service em requests de jobs/candidatos.

---

## Checklist pré-habilitação de `RAG_SYNTHESIS_ENABLED=True`

- [ ] T-01: `redact_ai_response_text` aplicado na resposta RAG
- [ ] T-02: API key sanitizada em network errors Gemini
- [ ] T-03: Decisão sobre VIEWER no assistente documentada
- [ ] T-10: Sanitização anti-injection na ingestão
- [ ] T-11: Política de content sanitization definida
- [ ] Staging: testar com documentos reais (não-sensitivos)
- [ ] CI: todos os testes unit passando (incluir novos testes de T-01 e T-02)
