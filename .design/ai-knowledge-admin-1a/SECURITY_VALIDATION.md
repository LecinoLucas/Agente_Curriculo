# Security Validation — AI-KNOWLEDGE-ADMIN-1A

## Padrões sensíveis bloqueados

O formulário administrativo agora bloqueia salvamento quando o conteúdo contém sinais de dado sensível, incluindo:

- CPF formatado e sem pontuação
- Telefone
- E-mail
- `api_key`
- `token`
- `secret`
- `payload_json`
- `vector_json`
- `content_hash`
- `embedding` e `embeddings`
- `currículo bruto`
- `RG`
- `laudo`
- `exame`
- `documento pessoal`
- `dados bancários reais`
- `senha`

Mensagem apresentada:

`Este conteúdo parece conter dados sensíveis. Remova essas informações antes de salvar na Base de Conhecimento.`

## Campos internos removidos da UI

Os trechos e resultados administrativos não exibem:

- `payload_json`
- `vector_json`
- `content_hash`
- `embedding`
- `embeddings`
- `review_notes`
- `internal_notes`
- `raw_ocr_text`
- `raw_resume_text`
- stack trace
- traceback

## Como os chunks são sanitizados

- Cada `content_preview` é passado por `sanitizeAssistantText`.
- Campos internos são filtrados pelo sanitizador compartilhado do assistente.
- A UI renderiza somente texto, sem `dangerouslySetInnerHTML`.
- Chunks longos ficam resumidos com `Ver mais` para reduzir exposição acidental.

## Como a busca é sanitizada

- A seção `Testar busca nesta base` usa `knowledge.search` com o contrato existente.
- A resposta retorna por `sanitizeResponse` antes de ser apresentada.
- Títulos, trechos, relevância e warnings passam pela camada de apresentação segura já usada no assistente.
- Warnings técnicos de embedding/provider são convertidos em mensagens amigáveis.

## Riscos restantes

- A rejeição de PII está no frontend; clientes alternativos ainda podem tentar enviar conteúdo sensível ao backend.
- Diagnósticos seguros dependem do contrato atual do endpoint; quando um metadado não é seguro ou não existe, a tela mostra `—`.
- O provider de embeddings continua sendo uma dependência operacional externa; falhas dele são tratadas com mensagem amigável, mas não resolvidas nesta fase.

## Recomendação futura

- Repetir a validação de conteúdo sensível no backend durante criação/edição/publicação.
- Sanitizar novamente qualquer payload de recuperação antes de persistir índices ou logs operacionais.
- Adicionar política explícita de rejeição para documentos pessoais e currículos brutos na ingestão administrativa.
