# Portal 2 Flow Audit - OP-6F-AUDIT

Data: 2026-06-02

Escopo: auditoria por leitura do código real e dos testes existentes. Nenhum backend, frontend, teste, migration, pipeline, Conversation Engine, CandidateApplication, WhatsApp, IA/matching ou pré-admissão foi alterado.

## Arquivos auditados

- `backend/src/application/services/conversation_service.py`
- `backend/src/application/services/conversation_state_machine.py`
- `backend/src/infrastructure/database/models/conversation_model.py`
- `backend/src/infrastructure/database/models/candidate_application_model.py`
- `backend/src/infrastructure/repositories/sqlalchemy_conversation_repository.py`
- `backend/src/infrastructure/repositories/sqlalchemy_candidate_application_repository.py`
- `backend/src/application/services/candidate_application_service.py`
- `backend/src/application/services/candidate_application_pipeline_service.py`
- `backend/src/interface/api/schemas/conversation_schemas.py`
- `backend/src/interface/api/schemas/candidate_application_schemas.py`
- `candidate-portal/src/pages/CandidatePortal2Page.tsx`
- `candidate-portal/src/services/conversationsService.ts`
- `candidate-portal/src/services/conversationStorage.ts`
- Testes de integração de conversa, identidade, OTP, lead registration, content provider e link com pipeline.

## Resumo executivo

O Portal 2 tem dois mecanismos diferentes de retomada:

1. Retomada por `localStorage/session_id` no frontend: recarrega exatamente a sessão armazenada via `GET /conversations/{id}` e `GET /conversations/{id}/messages`.
2. Retomada por CPF/WhatsApp no backend: no estado `IDENTIFY`, resolve silenciosamente um `Candidate`, procura primeiro uma sessão ativa desse candidato e, se não existir, procura uma `CandidateApplication` ativa/recente.

O problema observado é comportamento real atual: quando existe `CandidateApplication` ativa e não existe sessão ativa, o backend salva internamente `pending_application_id`, `pending_application_status` e `application_in_progress`, mas responde publicamente sempre:

> "Você já tem uma candidatura em andamento. Para continuar, me diga em qual cidade ou localidade você quer trabalhar."

Essa resposta não usa `status`, `job_id`, localidade/unidade/função/turno já existentes, `candidate_id` verificado, nem vínculo com pipeline. Ela também não vincula a sessão nova à application encontrada.

## Fluxo real ponta a ponta

### 1. Criar conversa

`POST /api/v1/conversations` cria uma `conversation_sessions` ativa em `IDENTIFY`, sem `candidate_id`, sem `application_id` e com `context_json={}`. A primeira mensagem do assistente pede CPF ou WhatsApp.

Fonte: `ConversationService.create_session`; `conversation_state_machine.first_prompt`.

### 2. Identificação por CPF/WhatsApp

No primeiro `POST /messages`, se o estado atual é `IDENTIFY`, o backend:

- classifica o texto como CPF ou WhatsApp;
- normaliza para dígitos;
- resolve `candidate_id` por `cpf_hash`, fallback por CPF plaintext normalizado, ou `Candidate.phone`;
- nunca autentica o candidato nesse momento;
- grava apenas marcadores públicos e internos no `context_json`;
- define `lead_mode=True` e `identity_verified=False`;
- aciona a lógica de retomada se o candidato existir.

Se o identificador não existe, a resposta pública é igual à de sucesso comum para evitar enumeração:

"Certo. Agora me diga em qual cidade ou localidade você quer trabalhar."

Fonte: `conversation_service.py`, `_handle_identify`, `_classify_identifier`, `_resolve_candidate_id_by_cpf`, `_resolve_candidate_id_by_phone`.

### 3. Prioridade de retomada por CPF/WhatsApp

Quando o candidato foi encontrado:

1. Busca sessão ativa anterior com `ConversationSessionModel.candidate_id == candidate_id`, `status == active`, não deletada, diferente da sessão atual, ordenada por `last_message_at desc`, `updated_at desc`.
2. Se encontrou sessão, copia somente contexto seguro e retoma no estado seguro.
3. Se não encontrou sessão, busca `CandidateApplication` ativa mais recente (`started`, `qualified`, `submitted`, `linked_to_pipeline`).
4. Se encontrou application, grava dados internos da application e força estado `CHOOSE_LOCATION`.
5. Se não encontrou nada, segue para `CHOOSE_LOCATION` com a mensagem indistinguível de sucesso/not found.

Fonte: `_resume_prompt_if_available`, `_find_resume_session`, `_find_active_application`.

### 4. Retomada por sessão ativa

Quando existe sessão ativa anterior:

- o conteúdo público da resposta é sempre "Encontrei uma conversa em andamento. Vamos continuar de onde você parou.";
- `quick_replies` vêm do estado retomado;
- só são copiados `location_hint`, `preference`, `desired_function`, `desired_shift`, `show_jobs_ack`, `resume_choice`;
- estados inseguros (`IDENTIFY`, `VERIFY_OTP`, `COLLECT_LEAD_*`, `DONE`) caem para `CHOOSE_LOCATION`;
- se a sessão anterior tinha `application_id`, a nova sessão coloca esse id apenas em `pending_application_id` interno, não em `conversation.application_id`.

Funciona hoje, mas a mensagem é genérica: ela não diz a pergunta real do estado. O frontend mostra histórico se a retomada foi por `localStorage`, mas na retomada por CPF/WhatsApp a nova sessão só recebe a mensagem genérica e as opções do estado.

### 5. Retomada por CandidateApplication ativa

Quando não há sessão ativa e há application ativa:

- seleciona a application ativa mais recente;
- salva internamente:
  - `pending_application_id`
  - `pending_application_status`
  - `application_in_progress=True`
- não seta `conversation.candidate_id`;
- não seta `conversation.application_id`;
- não verifica OTP;
- não consulta `job_id`;
- não consulta pipeline;
- não reidrata localidade/unidade/função/turno da application no contexto;
- força `conversation.current_state = CHOOSE_LOCATION`;
- responde a mesma frase para qualquer status ativo.

Este é o ponto exato da mensagem observada.

### 6. Coleta normal de preferências

Estados principais:

- `CHOOSE_LOCATION` salva `location_hint`;
- `CHOOSE_UNIT_OR_ANY` salva `preference`;
- `CHOOSE_FUNCTION` salva `desired_function`;
- `CHOOSE_SHIFT` salva `desired_shift`;
- `SHOW_JOBS` salva `show_jobs_ack`;
- `COLLECT_RESUME` salva `resume_choice`;
- `CONFIRM_APPLICATION` confirma ou avança para `DONE`/OTP.

Para candidato já seguro (`conversation.candidate_id` preenchido), a CandidateApplication é criada/atualizada assim que houver um dos gatilhos reais de intake: `location_hint`, `preference`, `desired_function`, `desired_shift`.

Para candidato resolvido apenas por CPF/WhatsApp, a application não é criada antes de OTP.

### 7. Lead novo

Se CPF/WhatsApp não resolve candidato:

- `identifier_unresolved=True` fica só no contexto interno;
- leads por WhatsApp guardam `lead_whatsapp` interno para evitar pedir o telefone de novo;
- o bot coleta localidade, unidade, função, turno, currículo;
- ao chegar em `COLLECT_RESUME`, se ainda é lead não resolvido, entra em `COLLECT_LEAD_NAME`;
- depois coleta WhatsApp se necessário;
- pede LGPD;
- se recusou LGPD, cancela a sessão e remove `lead_name`/`lead_whatsapp`;
- se aceitou, vai para confirmação;
- ao confirmar, emite OTP tardio;
- só depois de OTP válido cria Candidate mínimo e CandidateApplication.

### 8. OTP tardio

OTP não é emitido no `IDENTIFY`. Ele é emitido ao confirmar a candidatura quando:

- a sessão ainda não tem `candidate_id`; ou
- a identidade está pendente.

Ao OTP válido:

- se o OTP tinha `candidate_id`, seta `conversation.candidate_id`;
- se era lead novo, cria Candidate mínimo;
- limpa ids pendentes do contexto;
- seta `identity_verified=True`;
- vai para `DONE`;
- `_sync_application` cria/atualiza application quando aplicável.

### 9. Pipeline

Conversation Engine não cria pipeline. A pipeline é vinculada por serviço separado, que exige:

- application existente;
- status `submitted` ou já `linked_to_pipeline`;
- `candidate_id`;
- `job_id`;
- ausência de pipeline ativa conflitante.

O chat atual cria application com `job_id=None`, portanto não consegue enviar sozinho para pipeline.

## Fluxos simulados por leitura/testes

| Cenário | Funciona hoje |
| --- | --- |
| Usuário novo por CPF inexistente | Vai para `CHOOSE_LOCATION` em `lead_mode`; não cria Candidate/Application antes de OTP. |
| Usuário novo por WhatsApp inexistente | Vai para `CHOOSE_LOCATION`; guarda `lead_whatsapp` interno; pula coleta de WhatsApp depois do nome. |
| Candidato existente sem application/sessão | Vai para `CHOOSE_LOCATION`; `pending_candidate_id` fica interno; sem OTP até confirmação. |
| Candidato existente com application `started` | Vai para `CHOOSE_LOCATION` com mensagem de candidatura em andamento; não usa dados da application. |
| Candidato existente com application `submitted` | Mesma resposta de application em andamento; não diferencia status. |
| Candidato existente com application `linked_to_pipeline` | Mesma resposta de application em andamento; não informa análise pelo RH. |
| Candidato existente com sessão ativa em `CHOOSE_SHIFT` | Retoma estado `CHOOSE_SHIFT` com mensagem genérica de retomada e quick replies do estado. |
| Lead que recusou LGPD | Vai para `DONE`, sessão `cancelled`, sem Candidate/Application. |
| Lead que aceitou LGPD e chegou no OTP | Vai para `VERIFY_OTP`; Candidate/Application só após OTP correto. |
| Reload por `localStorage/session_id` | Frontend busca sessão e histórico por GET e mostra "Continuamos de onde você parou." |
| Começar nova conversa | Frontend limpa `candidate_portal2_session_id` e cria nova sessão em `IDENTIFY`. |

## Ponto central do problema observado

Funciona hoje:

- a engine detecta application ativa;
- registra internamente que há application;
- retorna para `CHOOSE_LOCATION`;
- a próxima mensagem "vamos"/"continuar"/"ok" mantém `CHOOSE_LOCATION` e repete "Para continuar, me diga em qual cidade ou localidade você quer trabalhar.";
- se o candidato digitar uma cidade válida, a conversa continua como intake novo.

Deveria funcionar:

- diferenciar status e pendências;
- se application já tem localidade, não pedir cidade novamente;
- se já tem `job_id`, não tratar como candidatura sem vaga;
- se `submitted`/`linked_to_pipeline`, mostrar status operacional seguro;
- se faltam campos, pedir a próxima pendência real;
- vincular a sessão à application retomada quando for seguro.

## Evidências de testes existentes

Os testes já consolidam parte desse comportamento como esperado hoje:

- `test_identify_with_existing_cpf_active_application_returns_safe_status` espera a frase "Você já tem uma candidatura em andamento..." e estado `CHOOSE_LOCATION` para application `qualified`.
- `test_identify_with_existing_whatsapp_active_application_asks_location_safely` espera a mesma resposta para WhatsApp.
- `test_resolved_candidate_creates_application_only_after_late_otp` valida que candidato resolvido por CPF só cria application depois de OTP.
- `test_unresolved_lead_collects_data_and_creates_candidate_and_application` valida criação de Candidate/Application para lead novo após LGPD + OTP.
- `test_application_integration_never_creates_pipeline` valida que a conversa não cria pipeline.

## Observação sobre execução

Não rodei chamadas reais contra banco/dev server para evitar criação de dados ou dependência do estado local. A simulação foi feita por leitura do código e dos testes existentes que já exercitam os cenários críticos.
