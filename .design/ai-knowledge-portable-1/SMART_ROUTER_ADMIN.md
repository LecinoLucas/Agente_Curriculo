# Smart Router Administrativo

## Objetivo

Evitar chamadas desnecessárias para Gemini em perguntas administrativas simples sobre:

- Base de Conhecimento
- Laboratório IA
- Credenciais IA
- Usage/tokens
- Status do provider
- Limites operacionais do assistente

## Estratégia

O classificador local do Assistente agora resolve essas perguntas no frontend antes de qualquer chamada ao backend.

Novo resultado local:

- `local_answer`

Esse resultado:

- renderiza resposta template segura;
- pode exibir próximos passos com navegação local;
- não chama `aiAssistantService.query`;
- não aciona `knowledge.answer`;
- não aciona escrita;
- não depende de Gemini.

## Perguntas cobertas

### Base de Conhecimento

- `consigo cadastrar novos conhecimentos?`
- `como cadastro conhecimento?`
- `onde adiciono documento na base?`
- `como alimento a base de conhecimento?`
- `como ensino o assistente?`
- `onde cadastro documento do rag?`

Resposta:

- orienta a usar `/admin/conhecimento`;
- reforça restrições de conteúdo sensível;
- explica a necessidade de reindexação manual.

### Reindexação

- `como reindexar documento?`
- `como reprocessar documento?`

Resposta:

- explica o fluxo manual em `/admin/conhecimento`.

### IA/Admin

- `onde vejo tokens?`
- `quanto estou gastando de ia?`
- `gemini está ativo?`
- `onde configuro a chave da ia?`
- `como testar a ia?`
- `onde vejo erros da ia?`
- `o assistente pode executar ações?`
- `o assistente pode exportar protheus?`

Respostas:

- navegam para `/admin/health`, `/admin/bi`, `/admin/ia`, `/admin/ai-provider-credentials` e `/admin/conhecimento`;
- mantêm o assistente como read-only;
- não abrem chat livre.

## Atalhos adicionados no contexto admin

- Base de Conhecimento
- Laboratório IA
- Saúde do sistema
- Credenciais IA
- BI & Métricas

## Limites atuais

- O router continua determinístico por regras locais.
- Perguntas administrativas fora dos padrões cobertos ainda podem cair na rota de conhecimento.
- Não há escrita automática nem cadastro de documento via Assistente.
