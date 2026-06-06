# ADR-001: Arquitetura de Orquestração de IA no ATS/RH

**Status:** Accepted  
**Data:** 2026-06-06  
**Autores:** Time de Plataforma de IA  
**Revisão:** FASE AI-ARCH-1

---

## Contexto

O sistema ATS/RH evoluiu de um backend FastAPI convencional para um sistema com capacidades de geração e triagem assistida por IA. Nas fases anteriores (JOB-AI-FIX-1B, JOB-AI-FIX-1C, JOB-AI-GRAPH-1/2) foi introduzida uma camada de orquestração com LangGraph para geração de rascunhos de vagas.

Para suportar capacidades mais avançadas — assistente conversacional, multi-agent, RAG sobre documentos internos e automações com aprovação humana — é necessário definir uma arquitetura de referência clara que governe como a IA se integra ao sistema.

---

## Decisão

Adotamos uma arquitetura em camadas onde a IA opera como uma **camada de orquestração isolada** que se comunica com o domínio de negócio exclusivamente por meio de **Tools controladas**, e não por acesso direto ao banco de dados ou a serviços internos.

---

## Por que LangGraph / LangChain no ATS/RH

### Motivações

1. **Orquestração de estado**: LangGraph fornece `StateGraph` tipado, permitindo que fluxos de IA com múltiplos passos (parse → validate → refine → evaluate) sejam testáveis, observáveis e reversíveis.
2. **Fluxo multi-agente futuro**: A abstração de `Supervisor → SubAgent` é nativa no LangGraph, sem exigir frameworks externos.
3. **Compatibilidade com Tools**: Tools estruturadas (com Pydantic) são first-class citizens no ecossistema LangChain/LangGraph.
4. **Testabilidade**: Nodes são funções puras/async testáveis de forma isolada, sem depender de providers de IA reais.
5. **Feature flags**: A camada de orquestração pode ser ativada/desativada via `settings.JOB_AI_DRAFT_USE_LANGGRAPH`, mantendo fallback seguro.
6. **Adoção incremental**: Cada fase adiciona nodes e agentes sem quebrar o contrato público da API.

### Alternativas consideradas e descartadas

| Alternativa | Motivo de descarte |
|---|---|
| CrewAI | Menos controle sobre estado; dificulta testes unitários de nodes |
| Agentes LangChain legados | Sem suporte a StateGraph; difícil de testar em isolamento |
| Implementação customizada | Alto custo de manutenção; reescrita de observabilidade e routing |
| Celery tasks puras | Sem capacidade de raciocínio multi-step ou RAG nativo |

---

## O que entra na camada de IA (`ai_orchestration/`)

- Grafos de orquestração (`StateGraph`)
- Nodes de processamento (normalização, parsing, validação, qualidade)
- Agentes sub-especializados (Job Agent, Candidate Agent, etc.)
- Roteador de supervisão (Supervisor Agent)
- RAG: retriever, chunking, schemas de resposta com citação
- Tools: contratos de tools com PermissionGuard
- Estado de assistente conversacional
- Logging e tracing de execuções de IA

## O que NÃO entra na camada de IA

- Regras de negócio core (ex: elegibilidade de candidato, score de ranking)
- Acesso direto a banco de dados (SQLAlchemy, migrations, models)
- Autenticação/autorização de usuários
- Endpoints HTTP e schemas de API (FastAPI routers/schemas)
- Workers Celery (dispatchers e tasks)
- Upload e processamento de arquivos
- Qualquer lógica que salve dados sem aprovação humana explícita

---

## Separação entre Application Services e AI Orchestration

```
┌─────────────────────────────────────────────────────────┐
│                     API Layer (FastAPI)                  │
│              Routers, Schemas, Auth Middleware           │
└─────────────────────┬───────────────────────────────────┘
                      │ chama
┌─────────────────────▼───────────────────────────────────┐
│              Application Services Layer                  │
│    JobAiDraftService, CandidateService, etc.            │
│    Único ponto de entrada para AI Orchestration         │
└──────────┬──────────────────────────────────────────────┘
           │ delega para (via feature flag)
┌──────────▼──────────────────────────────────────────────┐
│              AI Orchestration Layer                      │
│    Graphs, Agents, Tools, RAG, Assistant                │
│    NÃO acessa DB diretamente                            │
│    Recebe AgentContext com permissões do usuário        │
└──────────┬──────────────────────────────────────────────┘
           │ chama via Tools controladas
┌──────────▼──────────────────────────────────────────────┐
│              Infrastructure / Domain Layer               │
│    Repositories, Models, External APIs, Protheus        │
└─────────────────────────────────────────────────────────┘
```

**Regra fundamental**: Application Services são a única ponte entre AI Orchestration e Infrastructure. A camada de IA nunca importa de `src.infrastructure` diretamente.

---

## Regras Arquiteturais

### R1: Agentes não acessam banco diretamente

Agentes e graphs operam exclusivamente com dados recebidos via Tools. As Tools são implementadas na camada de Application Services e podem acessar Infrastructure. O graph/agente chama a Tool, recebe o resultado tipado (`ToolResult`) e decide o próximo passo.

```python
# ❌ PROIBIDO dentro de um node/agente
from src.infrastructure.database.models import Job
session.query(Job).all()

# ✅ CORRETO: agente chama tool que retorna dados
result: ToolResult = await job_tools.get_job_summary(context, job_id)
```

### R2: Ações sensíveis exigem aprovação humana

Qualquer Tool que modifique estado (criar, editar, deletar, aprovar) deve retornar `requires_approval=True` com `approval_reason` explicativo. Nenhuma ação destrutiva ou modificadora pode ser executada automaticamente.

```python
# Exemplos de ações que SEMPRE exigem aprovação humana
# - Mover candidato de etapa
# - Emitir carta de oferta
# - Iniciar pré-admissão
# - Exportar para Protheus
# - Rejeitar candidato
# - Alterar dados de vaga publicada
```

### R3: Permissões do usuário valem para tools/agentes

O `AgentContext` carrega o `user_id`, `role` e `permissions` do usuário que iniciou a sessão. O `ToolPermissionGuard` valida que o contexto possui permissão suficiente antes de executar qualquer Tool. Um agente nunca tem permissões maiores que o usuário que o invocou.

### R4: RAG deve citar fontes

Toda resposta gerada por RAG deve incluir a lista de `RagSource` utilizadas. É proibido retornar respostas sem fonte identificável quando o sistema RAG for utilizado.

### R5: Observabilidade obrigatória

Toda execução de graph/agente/tool deve registrar:
- `request_id` e `session_id`
- Agente executado
- Tool chamada e duração
- Resultado ou erro
- Quantidade de fontes RAG utilizadas
- Decisão de handoff ou aprovação humana solicitada

---

## Consequências

### Positivas
- Contratos claros isolam a IA do domínio de negócio
- Testes unitários de nodes são possíveis sem mocks de banco
- Feature flags permitem rollout gradual e seguro
- Governança e auditoria são garantidas por design

### Negativas / Riscos
- Overhead de indireção via Tools (mitigável com caching inteligente)
- Curva de aprendizado em LangGraph para o time
- Dependência de biblioteca de terceiros (mitigável com fallback legado)

---

## Referências

- LangGraph Documentation: https://langchain-ai.github.io/langgraph/
- Fases anteriores: JOB-AI-FIX-1B, JOB-AI-FIX-1C, JOB-AI-GRAPH-1, JOB-AI-GRAPH-1A, JOB-AI-GRAPH-2
- MULTI_AGENT_PLAN.md
- RAG_PLAN.md
- TOOL_CONTRACTS.md
- SECURITY_AND_GOVERNANCE.md
