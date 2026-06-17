# BOT_PROMPTS.md

## Objetivo

Documentar onde os prompts do bot de candidato existem hoje, quais regras já estão implícitas no código e o que ainda precisa ser centralizado antes do MVP visual do chat.

## Atualização de Runtime

Após a centralização em runtime desta fase, o contrato principal passou a morar em:

- `backend/src/application/prompts/candidate_bot_prompts.py`

O módulo central reúne:

- `CANDIDATE_BOT_SYSTEM_PROMPT`
- `CANDIDATE_INTENT_CLASSIFICATION_PROMPT`
- `CANDIDATE_SAFE_RESPONSE_PROMPT`
- catálogo de intents públicas permitidas;
- catálogo de dados permitidos e proibidos;
- regras de handoff;
- regras de confirmação antes de escrita.

Compatibilidade mantida nesta fase:

- `CandidateAssistantIntentService` continua usando intents internas do fluxo guiado (`choose_location`, `choose_shift`, `confirm_application`, etc.);
- o catálogo público de intents do bot candidato foi centralizado sem substituir o contrato interno já usado pelo fluxo determinístico;
- `ConversationService` continua sendo a autoridade de estado, handoff e sanitização de mensagens.

## 1. System Prompt do Bot Candidato

Local atual:

- `backend/src/application/services/candidate_assistant_intent_service.py`
- constante `_SYSTEM_PROMPT`

Papel atual:

- não é um prompt de resposta final ao candidato;
- é um prompt de classificação estruturada de intenção;
- a IA só pode interpretar a mensagem e extrair hints;
- a IA não pode decidir estado, aprovar, reprovar, contratar, inventar vaga ou inferir PII.

Regras embutidas hoje:

- responder apenas JSON válido;
- usar apenas intents permitidos;
- usar `unclear` com baixa confiança quando necessário;
- nunca incluir CPF, telefone ou email em nenhum campo;
- não prometer contratação;
- não inventar vagas;
- não inferir dados pessoais.

## 2. Prompt de Classificação de Intenção

Local atual:

- `backend/src/application/services/candidate_assistant_intent_service.py`
- `_SYSTEM_PROMPT`
- `_user_prompt(...)`

Payload enviado hoje para a IA:

- `estado_atual`
- `mensagem` já sanitizada
- `intents_validos`
- `opcoes_rapidas`

O que explicitamente NÃO vai para a IA:

- `context_json`
- CPF bruto
- telefone bruto
- email bruto
- sessão completa
- dados internos do RH

## 3. Prompt de Resposta ao Candidato

Hoje não existe um prompt LLM único de resposta do bot candidato.

O comportamento atual é híbrido:

- respostas estruturadas e determinísticas:
  - `backend/src/application/services/conversation_state_machine.py`
  - `backend/src/application/services/conversation_service.py`
- conteúdo configurável por estado, com fallback seguro:
  - `backend/src/application/services/assistant_content_provider.py`
  - `backend/src/application/services/assistant_settings_catalog.py`

Mensagens relevantes:

- identificação, localidade, função, turno, currículo, confirmação:
  - `conversation_state_machine.prompt_for(...)`
- fallbacks e quick replies editáveis:
  - `assistant_state_contents`
  - `assistant_quick_replies`
- handoff:
  - `ConversationService._TALK_TO_HR_MESSAGE`

Observação importante:

- `talk_to_hr_message` existe em `assistant_settings_catalog.py`, mas hoje não entra no read path;
- o handoff ainda usa a constante `_TALK_TO_HR_MESSAGE` em `ConversationService`.

## 4. Regras Anti-Alucinação

Já aplicadas hoje:

- `ConversationService` continua sendo a autoridade de estado;
- `CandidateAssistantIntentService` só interpreta intenção;
- qualquer falha do parser cai para fallback determinístico;
- intents fora de escopo do estado atual retornam `None`;
- baixa confiança retorna `None`;
- JSON inválido retorna `None`;
- campos extras retornados pela IA são rejeitados;
- quick replies e transições continuam determinísticos.

## 5. Regras LGPD e Dados Sensíveis

Já aplicadas hoje:

- a mensagem do candidato é sanitizada antes de chegar à IA;
- `context_json` não é enviado ao parser;
- o parser não deve retornar CPF, telefone ou email;
- `CandidateSafeRetriever` restringe documentos a:
  - `visibility="public"`
  - `audience="candidate"`
- lookup direto por documento também foi protegido;
- `ConversationService._public_context(...)` e serialização pública evitam vazamento do contexto bruto.

O que o bot não deve fazer no MVP:

- pedir dados bancários;
- pedir dado de saúde, gravidez, religião ou outros dados sensíveis;
- expor critérios internos do RH;
- expor documentos internos;
- prometer prazo ou decisão de contratação.

## 6. Regras de Handoff

Local atual:

- `backend/src/application/services/conversation_service.py`

Regra ativa:

- intent `talk_to_hr` cria `conversation_handoffs`;
- o handoff é idempotente por sessão enquanto houver `pending`;
- a resposta ao candidato não promete prazo;
- `handoff_required=True` aparece na resposta do turno;
- o status da sessão continua `active`.

Gaps atuais:

- `should_handoff` continua aceito no contrato do parser, mas não é usado pelo `ConversationService`;
- `safe_user_message` continua aceito no contrato do parser, mas não é usado no fluxo atual.

Esses campos foram mantidos por compatibilidade com o contrato do parser e planejamento futuro, não por uso funcional atual.

## 7. Regras de Confirmação Antes de Criar Candidatura

Base atual:

- `ConversationStateMachine` tem estado `CONFIRM_APPLICATION`;
- quick replies:
  - `confirm`
  - `review`

Comportamento esperado do MVP:

- nenhuma criação de candidatura por tool de escrita deve ocorrer sem confirmação explícita;
- `WRITE_SAFE_WITH_CONFIRMATION` deve exigir confirmação humana ou confirmação inequívoca do candidato;
- o runtime read-only atual ainda não executa tools de escrita;
- a escrita segura atual usa resumo + quick replies de confirmação + validação final em `create_candidate_application_from_bot`;
- o draft parcial fica em `conversation.context_json["candidate_application_draft"]`;
- dados sensíveis continuam fora do draft.

## 8. Recomendação de Centralização

Fase seguinte recomendada:

1. Extrair uma camada própria de prompt contract do bot candidato.
2. Separar claramente:
   - prompt de classificação;
   - copy determinística do fluxo;
   - mensagens de handoff;
   - regras LGPD/safety.
3. Criar uma configuração explícita para:
   - mensagens reservadas de handoff;
   - fallback global;
   - mensagens de confirmação.

Hoje a base está funcional, mas o material ainda está distribuído entre:

- `candidate_assistant_intent_service.py`
- `conversation_state_machine.py`
- `conversation_service.py`
- `assistant_content_provider.py`
- `assistant_settings_catalog.py`
