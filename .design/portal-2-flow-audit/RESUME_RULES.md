# Resume Rules

## Retomada por `localStorage/session_id`

Local: `candidate-portal/src/services/conversationStorage.ts` e `CandidatePortal2Page.tsx`.

Funciona hoje:

1. O frontend guarda `candidate_portal2_session_id` em `localStorage`.
2. No mount, se existe id local, chama:
   - `GET /api/v1/conversations/{id}`
   - `GET /api/v1/conversations/{id}/messages`
3. Se as duas chamadas funcionam, mostra o histórico e mantém a sessão.
4. Se falha, limpa storage e cria conversa nova.
5. O banner local "Continuamos de onde você parou." aparece só nesse tipo de retomada.
6. "Começar nova conversa" limpa o storage e cria nova sessão no backend.

Prioridade: a retomada por storage acontece antes de criar nova sessão, mas só vale para o navegador/dispositivo atual.

## Retomada por CPF/WhatsApp

Local: `ConversationService._handle_identify`.

Funciona hoje:

1. CPF/WhatsApp é informado no estado `IDENTIFY`.
2. O backend classifica o identificador sem consultar banco para decidir tipo.
3. Resolve Candidate:
   - CPF por `cpf_hash`;
   - fallback CPF por coluna plaintext normalizada;
   - WhatsApp por `Candidate.phone`.
4. Se não encontrou Candidate, segue lead novo.
5. Se encontrou Candidate, tenta retomada.

## Ordem de prioridade quando Candidate existe

1. Sessão ativa anterior do candidato.
2. CandidateApplication ativa mais recente.
3. Fluxo normal em `CHOOSE_LOCATION`.

## Sessão ativa anterior

Busca:

- `candidate_id` igual;
- id diferente da sessão atual;
- `status == active`;
- `deleted_at is null`;
- ordenação por `last_message_at desc`, `updated_at desc`.

Retoma:

- copia apenas contexto seguro;
- se sessão antiga tinha `application_id`, guarda internamente `pending_application_id`;
- usa estado antigo se ele for seguro;
- estados inseguros caem para `CHOOSE_LOCATION`;
- resposta pública é sempre genérica: "Encontrei uma conversa em andamento. Vamos continuar de onde você parou."

Não faz:

- não transfere `candidate_id` para a sessão nova;
- não marca `identity_verified=True`;
- não copia ids sensíveis;
- não copia contexto de lead.

## CandidateApplication ativa

Busca:

- `candidate_id` igual;
- `status in ("started", "qualified", "submitted", "linked_to_pipeline")`;
- `deleted_at is null`;
- mais recente por `updated_at desc`, `created_at desc`.

Retoma:

- grava internamente `pending_application_id`;
- grava internamente `pending_application_status`;
- grava publicamente `application_in_progress=True`;
- força `CHOOSE_LOCATION`;
- responde que há candidatura em andamento e pede cidade/localidade.

Não faz:

- não diferencia `started`, `qualified`, `submitted`, `linked_to_pipeline`;
- não lê `job_id`;
- não lê preferências já salvas;
- não consulta pipeline;
- não vincula `conversation.application_id`;
- não exige OTP antes de prosseguir coletando cidade;
- não calcula próxima pendência.

## Mensagens públicas por retomada

| Situação | Mensagem hoje |
| --- | --- |
| Candidate encontrado sem sessão/application ativa | "Certo. Agora me diga em qual cidade ou localidade você quer trabalhar." |
| Candidate não encontrado | Mesma mensagem acima. |
| Sessão ativa encontrada | "Encontrei uma conversa em andamento. Vamos continuar de onde você parou." |
| Application ativa encontrada | "Você já tem uma candidatura em andamento. Para continuar, me diga em qual cidade ou localidade você quer trabalhar." |
| Usuário responde "vamos" após retomada de application | "Para continuar, me diga em qual cidade ou localidade você quer trabalhar." |

## Filtros de resposta pública

Contexto removido de `session.context`:

- `pending_candidate_id`
- `possible_candidate_id`
- `identifier_unresolved`
- `pending_confirmation`
- `otp_purpose`
- `pending_application_id`
- `pending_application_status`
- `resumed_from_session_id`
- `lead_name`
- `lead_whatsapp`

Mensagens de candidato em `GET /messages`:

- OTP de 6 dígitos vira `[código omitido]`.
- CPF/WhatsApp com 10 ou 11 dígitos vira texto mascarado com final de 3 dígitos.

Observação: a mensagem original do candidato é persistida no banco em `conversation_messages.content`, mas a API pública mascara na resposta.

## Coerência da mensagem atual

Funciona hoje:

- mensagem não revela status, nome, CPF, WhatsApp ou existência detalhada;
- evita enumeração ampla;
- impede exposição de ids internos.

Insuficiente:

- dizer "candidatura em andamento" já revela mais do que a resposta indistinguível normal;
- depois de revelar que há candidatura, não há próximo passo útil;
- pedir cidade é errado quando a application já tem localidade/unidade;
- `submitted` e `linked_to_pipeline` deveriam informar status operacional seguro, não reiniciar intake;
- `qualified` deveria seguir pendência ou status, não cidade genérica.

## Regras desejadas para próxima fase

Pequena fase implementável:

1. Criar uma função pura de derivação de retomada de application.
2. Entrada: `CandidateApplicationModel` + `ConversationSessionModel` + contexto.
3. Saída: estado seguro, mensagem pública segura, contexto seguro e se deve vincular `conversation.application_id`.
4. Cobrir por testes de unidade/integração sem mexer em pipeline.

Regras recomendadas:

- `linked_to_pipeline`: estado `DONE`, mensagem de análise pelo RH, sem pedir novos dados.
- `submitted`: estado `DONE`, mensagem de enviada para análise, sem pedir cidade.
- `started/qualified` com pendências: escolher próxima pendência real.
- application com localidade: não pedir localidade.
- application com `job_id`: não tratar como candidatura genérica sem vaga.
- sem consentimento LGPD quando for coletar dados novos: pedir consentimento antes.
