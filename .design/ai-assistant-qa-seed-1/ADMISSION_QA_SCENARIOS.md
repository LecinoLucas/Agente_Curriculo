# Admission QA Scenarios

| Cenário | Intent/rota | Payload | Resultado esperado | Status |
| --- | --- | --- | --- | --- |
| Resumo do caso QA | `admission.case_summary` | `{"admission_case_id":"e3fa2a43-7659-4aa6-baeb-3791e8e3cedd"}` | `ok=true`, progresso, blocker principal e sem CPF/telefone | Validated by automated endpoint test |
| Documentos do caso QA | `admission.documents_status` | `{"admission_case_id":"e3fa2a43-7659-4aa6-baeb-3791e8e3cedd"}` | contagens corretas, sem `review_notes`, sem OCR bruto | Validated by automated endpoint test |
| Eventos do caso QA | `admission.events_summary` | `{"admission_case_id":"e3fa2a43-7659-4aa6-baeb-3791e8e3cedd","page_size":10}` | eventos seguros, sem `payload_json` | Validated by automated endpoint test |
| Status do pacote QA | `protheus.export_status` | `{"package_id":"b90d090d-d651-4e69-87dc-57e632aab290"}` | `ok=true`, sem `payload_json`, sem envio real | Validated by automated endpoint test |
| Workspace admissional | `/admission/cases/e3fa2a43-7659-4aa6-baeb-3791e8e3cedd` | rota frontend | contexto admissional no drawer e sugestões admissionais | Route and frontend regressions validated |
| Resposta composta | drawer: `O que falta para exportar essa admissão?` | texto livre controlado | steps read-only com pendências do checklist | Ready for manual QA with seeded case |
| Documentos pendentes | drawer: `Quais documentos estão pendentes?` | texto livre controlado | identifica residência pendente, dados bancários rejeitados, ASO faltante | Ready for manual QA with seeded case |
| Eventos da admissão | drawer: `Ver eventos da admissão` | texto livre controlado | lista eventos sintéticos sem payload sensível | Ready for manual QA with seeded case |
