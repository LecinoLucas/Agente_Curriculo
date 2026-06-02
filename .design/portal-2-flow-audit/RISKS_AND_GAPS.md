# Risks and Gaps

## P0 - Retomada de application pode criar duplicidade depois

Funciona hoje:

- ao encontrar CandidateApplication ativa por CPF/WhatsApp, o backend guarda `pending_application_id` interno, mas não seta `conversation.application_id`.
- se a sessão posteriormente passar por OTP e ganhar `candidate_id`, `_sync_application` cria nova application quando `conversation.application_id` ainda está vazio.

Risco:

- duplicar candidaturas para o mesmo candidato, especialmente em application com `job_id=None`, onde a unicidade ativa por candidato/vaga não se aplica.

## P0 - Status `submitted`/`linked_to_pipeline` tratado como intake novo

Funciona hoje:

- `started`, `qualified`, `submitted` e `linked_to_pipeline` recebem a mesma mensagem e voltam para `CHOOSE_LOCATION`.

Risco:

- candidato com candidatura já enviada ou em análise pelo RH pode ser induzido a preencher dados novamente;
- operação perde clareza de status;
- pode gerar novo intake em cima de processo já avançado.

## P0 - Próxima pendência não é calculada

Funciona hoje:

- application existente não reidrata `preferred_location_group_id`, `preferred_unit_id`, `desired_job_area`, `desired_shift`, `job_id`.

Risco:

- pedir cidade quando já existe localidade;
- pedir dados já coletados;
- criar loop entre "candidatura em andamento" e `CHOOSE_LOCATION`;
- baixa confiança do candidato no assistente.

## P1 - Pipeline não é consultada na retomada

Funciona hoje:

- `linked_to_pipeline` é apenas status da application; o fluxo de conversa não busca pipeline ativa nem stage.

Risco:

- se a application estiver vinculada ou houver pipeline ativa por outro caminho, o bot não informa status operacional seguro;
- potencial desalinhamento entre Portal 2 e visão do RH.

## P1 - Mensagem de application em andamento revela existência específica

Funciona hoje:

- sucesso/not found comum em `IDENTIFY` é indistinguível;
- mas quando há application ativa, a resposta revela que existe candidatura em andamento.

Avaliação LGPD/security:

- não expõe CPF, telefone, nome ou ids;
- mas revela estado de relacionamento com a empresa para quem possui CPF/WhatsApp válido.

Risco:

- enumeração de candidatura em andamento por posse de identificador.

Mitigação recomendada:

- manter conteúdo genérico antes de OTP quando for informar status mais específico;
- ou exigir OTP antes de revelar status de candidatura.

## P1 - `GET /conversations` pode divergir do prompt DB

Funciona hoje:

- respostas de POST em estados normais usam `AssistantContentProvider`;
- `GET /conversations` monta `assistant_message` com `prompt_for()` hardcoded quando não recebe prompt explícito.

Risco:

- Admin do Assistente altera pergunta no banco;
- POST mostra uma pergunta, reload por GET pode mostrar outra.

## P1 - Schema de estados não lista lead states

Funciona hoje:

- state machine e constraint do modelo aceitam `COLLECT_LEAD_NAME`, `COLLECT_LEAD_WHATSAPP`, `COLLECT_LGPD_CONSENT`;
- `ConversationSessionResponse.current_state` é `str`, então a API responde;
- mas o `Literal ConversationState` em `conversation_schemas.py` não inclui os estados de lead.

Risco:

- drift de contrato;
- clients gerados ou validações futuras podem quebrar.

## P1 - `CONFIRM_APPLICATION` com "review" encerra fluxo

Funciona hoje:

- se a resposta não é exatamente `confirm`, o service grava `confirmation=<texto>` e avança para `DONE`.

Risco:

- quick reply "Revisar" não revisa;
- candidato pode encerrar sem confirmar.

## P2 - Candidate existente sem dados mínimos não tem pendências avaliadas

Funciona hoje:

- para Candidate existente retomado por CPF/WhatsApp, o bot não avalia nome, WhatsApp, LGPD, nem perfil antes de continuar.

Risco:

- prosseguir sem dados mínimos para contato/consentimento;
- pedir cidade quando a pendência real é WhatsApp/nome/LGPD.

## P2 - Application `qualified` não tem semântica de conversa

Funciona hoje:

- `qualified` é ativo para retomada, mas o chat não o produz nem interpreta.

Risco:

- status avançado vira coleta inicial;
- RH pode já ter qualificado e candidato recebe pergunta básica.

## P2 - Persistência de PII em mensagens brutas

Funciona hoje:

- contexto público mascara/remover PII;
- `GET /messages` mascara CPF/WhatsApp/OTP;
- mas `conversation_messages.content` guarda a entrada bruta do candidato.

Avaliação:

- isso pode ser necessário para auditoria interna, mas precisa estar coberto por controles de acesso, retenção e logs.

Risco:

- acesso interno indevido ao banco expõe CPF/telefone enviados no chat.

## Pontos positivos confirmados

- CPF completo não aparece em `session.context` público.
- Telefone completo não aparece em `session.context` público.
- `lead_name` e `lead_whatsapp` não aparecem em contexto público.
- `pending_candidate_id`, `pending_application_id`, `pending_application_status` não aparecem em contexto público.
- OTP é mascarado em respostas de mensagens.
- OTP é tardio e não emitido no `IDENTIFY`.
- Candidate/Application de lead novo só são criados após LGPD + OTP.
- Conversation Engine não cria pipeline.

## Riscos de regressão em uma próxima implementação

- Quebrar anti-enumeração em `IDENTIFY`.
- Expor `pending_application_id`/`candidate_id`/`job_id` em resposta pública.
- Vincular `conversation.application_id` antes de OTP de forma que permita takeover de application.
- Parar de criar application para candidato autenticado com `candidate_id` explícito.
- Criar pipeline acidentalmente pelo chat.
- Fazer `GET /conversations` e `POST /messages` divergirem mais.
- Impedir lead novo por WhatsApp de pular coleta de WhatsApp.
- Reabrir estados de lead parcialmente preenchidos por retomada insegura.
