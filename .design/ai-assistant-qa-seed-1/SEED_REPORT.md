# AI Assistant QA Seed 1

## Dados fictícios criados

- Staff QA: `assistant.qa.seed@example.test`
- Candidato QA: `Candidato QA Admissional`
- E-mail do candidato: `qa.admissional@example.test`
- CPF fictício controlado: `00000000000`
- Telefone: `null`
- Vaga QA: `Analista QA Admissional`
- Caso de pré-admissão QA: status `documents_pending`

## IDs gerados nesta validação

- `candidate_id`: `209c30ff-da69-4b8f-9b0b-61dba89e9d20`
- `job_id`: `5783eba9-13b3-44a1-97b3-8c3d90132826`
- `case_id`: `e3fa2a43-7659-4aa6-baeb-3791e8e3cedd`
- `package_id`: `b90d090d-d651-4e69-87dc-57e632aab290`

## Massa admissional

- Documento de identificação: `approved`
- Comprovante de residência: item `received`, documento `uploaded`
- Dados bancários: `rejected`
- ASO: `pending` sem documento atual

## Eventos criados

- `case_created`
- `document_uploaded`
- `checklist_item_rejected`
- `checklist_item_correction_requested`

## Pacote sintético Protheus

- Pacote QA criado apenas para validar `protheus.export_status`
- Payload sintético sem CPF, telefone, OCR ou `payload_json` exposto ao assistente
- Não executa envio real

## Como encontrar os IDs

- Rodar `.venv/bin/python scripts/seed_pre_admission_qa.py --reset`
- O script imprime `candidate_id`, `job_id`, `case_id` e `package_id`

## Confirmações

- Nenhum dado real foi usado
- Nenhum telefone real foi usado
- Nenhum e-mail real de pessoa foi usado
- Nenhum arquivo pessoal real foi criado
- `PROTHEUS_REAL_SEND_ENABLED=false`
- `ERP_ALLOW_REAL_SEND=false`
