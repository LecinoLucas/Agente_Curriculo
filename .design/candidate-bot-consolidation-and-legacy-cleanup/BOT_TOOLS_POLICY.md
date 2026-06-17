# BOT_TOOLS_POLICY.md

## Objetivo

Definir a política explícita de tools do bot de candidato para o MVP do portal, separando o que pode consultar, o que só pode escrever com confirmação e o que deve permanecer proibido.

## Classificação

### READ_ONLY

Permitidas no MVP do bot candidato, desde que expostas por um registry/contexto próprio do candidato:

- consultar vagas
- consultar detalhes da vaga
- consultar unidades da vaga
- consultar FAQ/RAG público
- consultar status da candidatura

Mapeamento técnico atual no `CandidateBotRegistry`:

- `search_public_jobs`
- `get_public_job_detail`
- `get_public_job_units`
- `search_candidate_knowledge`
- `answer_candidate_knowledge`
- `get_my_application_status`

Observação:

- o `DEFAULT_REGISTRY` continua sendo o registry read-only interno do ATS/RH;
- o portal do candidato agora usa um subconjunto explícito e separado via `CandidateBotRegistry`;
- cada tool exposta ao candidato usa permissões `candidate_*`, mantendo falha fechada para permissões internas.

### WRITE_SAFE_WITH_CONFIRMATION

Permitidas apenas com confirmação explícita e fora do runtime read-only automático:

- criar candidatura
- atualizar contato do candidato
- salvar resposta de triagem
- criar handoff

Estado atual:

- `conversation_handoffs` já existe e o `ConversationService` já cria handoff com `talk_to_hr`;
- `should_handoff` agora também aciona o handoff real no `ConversationService`;
- `create_candidate_application_from_bot` agora existe no `CandidateBotRegistry` como write-safe;
- a escrita continua fora do runtime read-only automático;
- `ConversationService` só chama a tool de escrita após resumo + confirmação explícita;
- o runtime read-only continua bloqueando tools não read-only e tools com `requires_approval=True`.

### FORBIDDEN_FOR_MVP

Devem permanecer proibidas:

- mover etapa do pipeline
- rejeitar candidato
- aprovar candidato
- criar pré-admissão
- exportar para Protheus
- alterar status de vaga
- excluir candidato
- alterar nota interna do RH

## O que a infraestrutura atual já representa bem

### `ToolDefinition`

Representa:

- `read_only`
- `requires_approval`
- `required_permissions`

### `ToolRuntime`

Garante hoje:

- bloqueio de tool não read-only em runtime read-only;
- bloqueio de tool com `requires_approval=True`;
- checagem de permissões antes da execução;
- execução apenas de tools registradas.

### `ToolPermissionGuard`

Garante hoje:

- presença de permissão granular no `AgentContext`;
- retorno padronizado de erro quando falta permissão.

## Lacunas atuais

### 1. `ToolPermissionGuard` não expressa a política completa sozinho

O guard atual só responde:

- tem permissão?

Ele não classifica:

- tool permitida para candidato;
- tool proibida para MVP;
- tool de escrita segura com confirmação.

Essa semântica hoje está mais próxima de:

- `ToolDefinition.read_only`
- `ToolDefinition.requires_approval`
- escolha do registry disponível
- contexto `actor_type="candidate"` com permissões `candidate_*`

### 2. Registry próprio do bot candidato foi criado, mas a política ainda não cobre writes futuros

O `CandidateBotRegistry` agora bloqueia por allowlist explícita e não herda o catálogo interno ATS/RH.

Ele mantém fora do escopo do candidato:

- pipeline
- admission
- protheus
- candidate internal summaries

Mesmo assim, a política ainda não modela explicitamente o estágio futuro de writes com confirmação.
Nesta fase, a primeira exceção controlada é a candidatura com:

- vaga pública válida;
- unidade válida para a vaga;
- nome;
- ao menos um contato;
- consentimento;
- confirmação explícita em contexto.

### 3. Falta um modelo explícito de policy tier

Seria útil no futuro ter algo como:

- `policy_tier="read_only"`
- `policy_tier="write_safe_with_confirmation"`
- `policy_tier="forbidden_for_candidate_mvp"`

Nesta fase isso foi documentado, não implementado, para evitar abrir feature maior.

## Recomendação

Antes da UI final do chat:

1. manter `CandidateBotRegistry` separado do `DEFAULT_REGISTRY`;
2. continuar expondo apenas tools compatíveis com o portal do candidato;
3. manter `ToolRuntime(read_only=True)` como padrão;
4. introduzir write tools somente com confirmação explícita;
5. manter pipeline, admissão, Protheus e ações internas fora do candidate registry.
