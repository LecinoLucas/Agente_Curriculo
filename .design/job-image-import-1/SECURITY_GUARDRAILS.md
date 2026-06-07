# Security Guardrails

## Guardrails mantidos

- A imagem nunca cria vaga automaticamente.
- A imagem nunca salva vaga automaticamente.
- A imagem nunca publica vaga automaticamente.
- O texto extraido sempre passa pelo `JobAiDraftService` existente.
- Regras antidiscriminatorias existentes continuam aplicadas.
- Salario sem evidencia explicita continua removido.
- Endereco/unidade sem evidencia explicita continua removido.
- Jornada sem evidencia explicita continua removida.
- Beneficios sem evidencia explicita continuam removidos.
- `selection_flow_type` continua exigindo revisao manual.
- `requires_manager_review` e `requires_behavioral_assessment` continuam bloqueados sem evidencia.

## Guardrails novos ou reforcados nesta fase

- Upload da imagem validado por extensao, MIME e tamanho.
- Nenhum path temporario e exposto ao usuario ou logado.
- Conteudo sensivel da imagem nao e logado em texto bruto.
- Resposta inclui `extracted_text` apenas para revisao humana no painel autenticado.
- OCR sem texto util retorna erro controlado.
- OCR curto ou potencialmente incompleto gera warning.
- Conteudo marcado como `diferencial` na imagem nao vira requisito obrigatorio.

## Warnings expostos ao usuario

- `image_text_extraction_requires_review`
- `ocr_text_may_be_incomplete`
- warnings herdados do `JobAiDraftService`
- `safety_check` quando ha conteudo sensivel ou discriminatorio

## Riscos restantes

- Se a arte tiver muito texto pequeno, QR code dominante ou baixa resolucao, o OCR pode vir parcial.
- O backend aceita WebP por compatibilidade do OCR existente, mas o frontend restringe a UX a PNG/JPG/JPEG nesta fase.
