# Image to Job Draft

## Objetivo

Permitir que RH envie uma arte de vaga em imagem e receba um rascunho estruturado, revisavel e aplicavel manualmente no formulario de vaga.

## Fluxo implementado

1. Frontend abre `JobAiDraftPanel` na tela de criacao/edicao de vaga.
2. O painel agora oferece duas opcoes:
   - `Colar descricao`
   - `Enviar imagem`
3. No modo imagem, o usuario envia `PNG` ou `JPG/JPEG` e pode informar `context_text` opcional.
4. O frontend envia `multipart/form-data` para `POST /api/v1/jobs/ai-draft/from-image`.
5. O backend:
   - valida upload;
   - extrai texto com `JobImageTextExtractionService`;
   - reutiliza `JobAiDraftService.generate(text_input=context_text, ocr_text=extracted_text)`;
   - devolve rascunho, warnings, `needs_review`, `safety_check`, `extracted_text` e `extraction_confidence`.
6. O frontend mostra:
   - nome do arquivo;
   - warnings;
   - preview do texto extraido;
   - preview editavel do rascunho;
   - botao `Aplicar ao formulario`.
7. Nenhum save, create ou publish e disparado automaticamente.

## Endpoint

`POST /api/v1/jobs/ai-draft/from-image`

### Request

- `multipart/form-data`
- `file`: imagem da vaga
- `context_text`: opcional

### Response

- mesma base de `AiDraftGenerateResponse`
- acrescido de:
  - `extracted_text`
  - `extraction_confidence`
  - `safety_check`

## Limites

- Tipos aceitos no frontend: `PNG`, `JPG`, `JPEG`
- Tipos aceitos no backend: `PNG`, `JPEG`, `WebP`
- Tamanho maximo: `5 MB`
- Sem persistencia permanente da imagem
- Sem autoaplicacao no formulario
- Sem autopublicacao

## Exemplos de comportamento

- Banner com salario explicito: salario e preservado no rascunho.
- Banner com beneficio explicito: beneficio e preservado.
- Banner com `Diferencial: Protheus`: item permanece opcional e nao vira obrigatorio.
- Banner sem texto util: erro controlado `422`.

## Riscos restantes

- O ambiente atual usa OCR local como fallback porque a infraestrutura de visao ainda nao foi habilitada no pipeline de IA.
- OCR imperfeito ainda pode perder partes da arte; por isso o fluxo sempre sinaliza revisao humana.
