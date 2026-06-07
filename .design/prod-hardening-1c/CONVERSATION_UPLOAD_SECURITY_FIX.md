# CONVERSATION_UPLOAD_SECURITY_FIX

## Causa raiz

O endpoint `POST /api/v1/conversations/{session_id}/resume` aceitava upload apenas com base no `session_id`.

Consequencia:

- qualquer cliente com um UUID valido de conversa ativa podia tentar enviar um curriculo
- nao havia prova de ownership, cookie, token assinado nem autenticacao ligada a sessao

## Fluxo legitimo identificado

O endpoint pertence ao fluxo publico do chatbot/conversation engine.

Evidencias:

- `POST /api/v1/conversations` cria uma sessao publica sem autenticacao staff
- `POST /api/v1/conversations/{session_id}/messages` continua esse fluxo publico
- nao existe JWT staff, candidate portal token ou assinatura temporaria especifica para esse upload
- o frontend/browser ja trabalha com cookie jar por padrao no mesmo host

Conclusao:

- o fluxo legitimo e publico/chatbot
- a protecao correta de menor impacto e ownership de sessao publica via cookie assinado vinculado ao `session_id`

## Estrategia escolhida

Opcao C adaptada ao fluxo publico existente:

- emitir um cookie `conversation_session_token` ao criar a conversa
- assinar esse cookie com JWT usando o segredo atual da aplicacao
- vincular o token ao `session_id`
- exigir esse cookie no upload do curriculo
- bloquear:
  - cookie ausente
  - cookie invalido/expirado
  - cookie de outra sessao

## Correcao aplicada

1. Criacao da conversa:

- `POST /api/v1/conversations` agora define cookie `conversation_session_token`
- o cookie e `httponly`, `samesite=lax`, com `path=/api/v1/conversations`

2. Upload do curriculo:

- `POST /api/v1/conversations/{session_id}/resume` agora exige o cookie assinado
- valida:
  - tipo do token
  - expiracao
  - `session_id` do token contra o `session_id` da rota

3. Logs:

- o log do upload deixou de incluir `temp_path`, evitando expor path interno desnecessariamente

## Testes adicionados/ajustados

- criacao de conversa agora valida que o cookie de ownership foi emitido
- upload sem cookie retorna `401`
- upload com cookie valido continua funcionando
- cookie valido de outra sessao retorna `403`
- `session_id` inexistente com token valido para a mesma sessao retorna `404`
- arquivo invalido continua bloqueado
- arquivo grande continua bloqueado
- resposta de erro continua controlada, sem stack trace

## Resultado

Teste focado do endpoint e fluxo relacionado:

- `18 passed`

Suíte completa:

- falhou em `tests/e2e/test_demo_full_flow.py::test_demo_full_flow_20_1`
- causa observada: falta de credencial IA ativa para avaliacao comportamental
- essa falha nao aponta para regressao do upload de conversa

## Riscos restantes

- o token de ownership protege especificamente o upload; outras rotas publicas de conversa continuam dependentes do `session_id`
- se no futuro houver endurecimento global do fluxo publico de conversa, convem aplicar o mesmo conceito a `GET /conversations/{session_id}` e `/messages`
- a expiracao do cookie esta fixa em 24h; se o produto exigir sessoes publicas mais longas, essa politica deve ser revisada conscientemente
