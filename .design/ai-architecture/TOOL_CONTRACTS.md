# Contratos de Tools: ATS/RH Multi-Agent

**Status:** Draft  
**Data:** 2026-06-06  
**Fase:** AI-ARCH-1 (Arquitetura Base)

---

## Visão Geral

As Tools são a única interface entre a camada de AI Orchestration e os dados do sistema ATS/RH. Cada Tool:

1. Recebe um `AgentContext` com as permissões do usuário
2. É validada pelo `ToolPermissionGuard` antes de executar
3. Retorna um `ToolResult` tipado
4. É registrada em observabilidade com duração e resultado
5. Nunca acessa banco de dados diretamente — delega para Application Services

---

## Contrato Base

```python
@dataclass
class AgentContext:
    user_id: str
    role: str
    permissions: list[str]  # ex: ["can_view_jobs", "can_view_candidates"]
    request_id: str
    session_id: str
    tenant_id: str | None = None
    source: str = "assistant"   # "assistant" | "graph" | "api"

@dataclass
class ToolResult:
    ok: bool
    data: dict | list | None
    error_code: str | None       # ex: "PERMISSION_DENIED", "NOT_FOUND"
    message: str | None
    requires_approval: bool = False
    approval_reason: str | None = None
```

---

## Tools de Vagas (Job Tools)

### `get_job_summary`

| Campo | Valor |
|---|---|
| **Finalidade** | Retornar resumo estruturado de uma vaga específica |
| **Módulo** | `src/ai_orchestration/tools/job_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "job_id": "uuid"
}
```

**Saída (ToolResult.data):**
```json
{
  "id": "uuid",
  "title": "Analista de RH",
  "area": "Recursos Humanos",
  "seniority": "mid",
  "work_model": "hybrid",
  "status": "published",
  "mandatory_skills": ["...", "..."],
  "nice_to_have_skills": ["..."],
  "open_since": "2024-01-15",
  "candidate_count": 23
}
```

**Permissão mínima:** `can_view_jobs`

---

### `search_jobs`

| Campo | Valor |
|---|---|
| **Finalidade** | Buscar vagas por critérios (área, status, seniority, etc.) |
| **Módulo** | `src/ai_orchestration/tools/job_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "query": "string opcional",
  "area": "string | null",
  "status": "published | draft | closed | null",
  "seniority": "string | null",
  "limit": 10
}
```

**Saída (ToolResult.data):**
```json
{
  "results": [
    {"id": "uuid", "title": "...", "area": "...", "status": "..."}
  ],
  "total": 5
}
```

**Permissão mínima:** `can_view_jobs`

---

## Tools de Candidatos (Candidate Tools)

### `get_candidate_summary`

| Campo | Valor |
|---|---|
| **Finalidade** | Retornar dados principais de um candidato |
| **Módulo** | `src/ai_orchestration/tools/candidate_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "candidate_id": "uuid"
}
```

**Saída (ToolResult.data):**
```json
{
  "id": "uuid",
  "name": "Nome do Candidato",
  "seniority": "senior",
  "skills": ["Python", "FastAPI"],
  "score": 0.87,
  "status": "in_pipeline"
}
```

**Permissão mínima:** `can_view_candidates`

**⚠️ Nota LGPD:** CPF, dados de saúde, endereço e outros dados sensíveis são **omitidos** desta resposta.

---

### `search_candidates`

| Campo | Valor |
|---|---|
| **Finalidade** | Buscar candidatos por critérios dentro de uma vaga |
| **Módulo** | `src/ai_orchestration/tools/candidate_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "job_id": "uuid",
  "query": "string opcional",
  "min_score": 0.5,
  "stage": "string | null",
  "limit": 20
}
```

**Saída (ToolResult.data):**
```json
{
  "results": [
    {"id": "uuid", "name": "...", "score": 0.87, "stage": "triagem"}
  ],
  "total": 8
}
```

**Permissão mínima:** `can_view_candidates`

---

## Tools de Pipeline (Pipeline Tools)

### `get_pipeline_status`

| Campo | Valor |
|---|---|
| **Finalidade** | Visão geral do pipeline de uma vaga |
| **Módulo** | `src/ai_orchestration/tools/pipeline_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "job_id": "uuid"
}
```

**Saída (ToolResult.data):**
```json
{
  "job_id": "uuid",
  "stages": [
    {"name": "Triagem", "count": 12},
    {"name": "Entrevista RH", "count": 5},
    {"name": "Entrevista Técnica", "count": 3},
    {"name": "Proposta", "count": 1}
  ],
  "total_candidates": 21
}
```

**Permissão mínima:** `can_view_pipeline`

---

## Tools de Admissão (Admission Tools)

### `get_admission_case`

| Campo | Valor |
|---|---|
| **Finalidade** | Status do processo de admissão de um candidato |
| **Módulo** | `src/ai_orchestration/tools/admission_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "candidate_id": "uuid"
}
```

**Saída (ToolResult.data):**
```json
{
  "admission_id": "uuid",
  "candidate_name": "...",
  "status": "awaiting_documents",
  "pending_documents": ["RG", "Comprovante de Residência"],
  "start_date": "2024-02-01"
}
```

**Permissão mínima:** `can_view_admissions`

---

### `get_pre_admission_documents`

| Campo | Valor |
|---|---|
| **Finalidade** | Lista documentos de pré-admissão e seus status |
| **Módulo** | `src/ai_orchestration/tools/admission_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "admission_id": "uuid"
}
```

**Saída (ToolResult.data):**
```json
{
  "documents": [
    {"name": "RG", "status": "pending"},
    {"name": "CPF", "status": "approved"},
    {"name": "Comprovante de Residência", "status": "rejected", "rejection_reason": "Documento ilegível"}
  ]
}
```

**Permissão mínima:** `can_view_admissions`

---

## Tools de Auditoria (Audit Tools)

### `get_audit_context`

| Campo | Valor |
|---|---|
| **Finalidade** | Histórico de ações sobre uma entidade |
| **Módulo** | `src/ai_orchestration/tools/audit_tools.py` |
| **Read-only** | ✅ Sim (permanente) |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "entity_type": "job | candidate | admission | pipeline_stage",
  "entity_id": "uuid",
  "limit": 20
}
```

**Saída (ToolResult.data):**
```json
{
  "events": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "action": "candidate_moved_to_stage",
      "performed_by": "user@email.com",
      "details": {"from_stage": "Triagem", "to_stage": "Entrevista RH"}
    }
  ]
}
```

**Permissão mínima:** `can_view_audit_logs`

---

## Tools de Conhecimento (Knowledge Tools)

### `search_knowledge`

| Campo | Valor |
|---|---|
| **Finalidade** | Consulta RAG na base de conhecimento interna |
| **Módulo** | `src/ai_orchestration/tools/knowledge_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "query": "string",
  "source_types": ["rh_policy", "ats_guide"],  # opcional, filtra fontes
  "limit": 5
}
```

**Saída (ToolResult.data = RagAnswer):**
```json
{
  "answer": "Conforme a política de RH...",
  "sources": [
    {
      "document_id": "uuid",
      "title": "Política de Benefícios",
      "chunk_id": "uuid",
      "source_type": "rh_policy",
      "score": 0.91,
      "metadata": {"section_heading": "Plano de Saúde"}
    }
  ],
  "confidence": 0.91,
  "warnings": []
}
```

**Permissão mínima:** `can_use_assistant`

---

## Tools de Protheus (Protheus Tools)

### `get_protheus_export_status`

| Campo | Valor |
|---|---|
| **Finalidade** | Status da exportação de admissão para o Protheus |
| **Módulo** | `src/ai_orchestration/tools/protheus_tools.py` |
| **Read-only** | ✅ Sim |
| **Aprovação humana** | ❌ Não |

**Entrada:**
```python
{
  "admission_id": "uuid"
}
```

**Saída (ToolResult.data):**
```json
{
  "admission_id": "uuid",
  "export_status": "pending | exported | failed | not_started",
  "exported_at": "2024-01-20T15:00:00Z | null",
  "error_message": "null | string"
}
```

**Permissão mínima:** `can_view_protheus_status`

---

## Tool de Aprovação Humana

### `request_human_approval`

| Campo | Valor |
|---|---|
| **Finalidade** | Sinalizar que uma ação requer aprovação humana antes de prosseguir |
| **Módulo** | `src/ai_orchestration/core/tool_contracts.py` |
| **Read-only** | ✅ Sim (registra intenção, não executa ação) |
| **Aprovação humana** | ✅ Por definição |

**Entrada:**
```python
{
  "action": "string — ação que precisa de aprovação",
  "reason": "string — justificativa",
  "context": "dict — dados relevantes para aprovação"
}
```

**Saída (ToolResult):**
```python
ToolResult(
    ok=True,
    data={"approval_id": "uuid", "status": "pending"},
    requires_approval=True,
    approval_reason="Ação requer confirmação de gestor",
    error_code=None,
    message="Solicitação de aprovação registrada."
)
```

**Permissão mínima:** Qualquer usuário autenticado pode solicitar aprovação.

---

## Resumo de Permissões

| Tool | Permissão Mínima | Read-only | Aprovação |
|------|-----------------|-----------|-----------|
| `get_job_summary` | `can_view_jobs` | ✅ | ❌ |
| `search_jobs` | `can_view_jobs` | ✅ | ❌ |
| `get_candidate_summary` | `can_view_candidates` | ✅ | ❌ |
| `search_candidates` | `can_view_candidates` | ✅ | ❌ |
| `get_pipeline_status` | `can_view_pipeline` | ✅ | ❌ |
| `get_admission_case` | `can_view_admissions` | ✅ | ❌ |
| `get_pre_admission_documents` | `can_view_admissions` | ✅ | ❌ |
| `get_audit_context` | `can_view_audit_logs` | ✅ | ❌ |
| `search_knowledge` | `can_use_assistant` | ✅ | ❌ |
| `get_protheus_export_status` | `can_view_protheus_status` | ✅ | ❌ |
| `request_human_approval` | Autenticado | ✅ | ✅ |
