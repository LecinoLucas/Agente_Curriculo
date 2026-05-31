# C3E — Pré-admissão Real (candidate-portal)

## Endpoints consumidos

| Método | Endpoint                                                                             | Usado em                              |
|--------|--------------------------------------------------------------------------------------|---------------------------------------|
| GET    | `/api/v1/public/candidate-portal/pre-admission`                                      | mount + reload após upload            |
| POST   | `/api/v1/public/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents` | upload de documento por item |
| GET    | `/api/v1/public/candidate-portal/pre-admission/documents/{document_id}/download`     | botão "Baixar" (via `window.open`)    |

`GET /pre-admission/{case_id}` não foi chamado separadamente — o endpoint de lista (`/pre-admission`) já retorna o caso ativo do candidato.

## Arquivos alterados

| Arquivo | Tipo |
|---|---|
| `src/services/candidatePreAdmissionService.ts` | **Novo** — tipos de API, mappers, 3 métodos |
| `src/pages/CandidatePreAdmissionPage.tsx` | Reescrito — todos os estados, upload real, download |

`publicApiClient.ts` não precisou de alteração — `get`, `post` e `postForm` já existiam.

## Mapeamento API → frontend

### `CandidatePortalPreAdmissionEnvelopeResponse` → `PreAdmissionEnvelope`

| Campo API | Campo interno |
|---|---|
| `case` | `case` (nullable) |
| `summary.has_pre_admission_case` | `summary.hasCase` |
| `summary.status_public_label` | `summary.statusLabel` |
| `summary.documents_total` | `summary.documentsTotal` |
| `summary.documents_pending` | `summary.documentsPending` |
| `summary.documents_submitted` | `summary.documentsSubmitted` |
| `summary.documents_approved` | `summary.documentsApproved` |
| `summary.next_pending_document` | `summary.nextPendingDocument` |

### `CandidatePortalPreAdmissionCaseResponse` → `PreAdmissionCase`

| Campo API | Campo interno | Nota |
|---|---|---|
| `id` | `id` | UUID do caso — usado na URL de upload |
| `status_public_label` | `statusLabel` | Exibido como badge |
| `salary_offer` | `salaryOffer` | Mostrado na sidebar se disponível |
| `start_date` | `startDate` | Data formatada no header |
| `work_model` | `workModel` | Exibido no header |
| `checklist_items` | `checklistItems` | Lista de documentos |
| `notes` | **omitido** | Campo interno — não exposto no schema candidate-facing |
| `hiring_decision_id`, `created_by` | **omitidos** | Campos internos |

### `CandidatePortalPreAdmissionChecklistItemResponse` → `ChecklistItem`

| Campo API | Campo interno |
|---|---|
| `item_id` | `id` — usado na URL de upload |
| `title` | `title` |
| `description` | `description` |
| `required` | `required` |
| `status` | `status` — controla badge e visibilidade do upload |
| `status_public_label` | `statusLabel` |
| `rejection_reason_public` | `rejectionReasonPublic` — exibido ao candidato |
| `uploaded_document` | `uploadedDocument` |
| `allowed_file_types` | `allowedFileTypes` → `accept` do `<input type="file">` |
| `max_file_size_mb` | `maxFileSizeMb` → validação client-side |

## Payload de upload

`POST /pre-admission/{case_id}/checklist-items/{item_id}/documents`  
Content-Type: `multipart/form-data`

| Campo | Tipo |
|---|---|
| `document_file` | `File` — arquivo real |

O arquivo é transmitido via `publicApiClient.postForm(path, FormData)`.

## Estados suportados

| Estado | Gatilho | UI |
|---|---|---|
| `loading` | mount | Spinner |
| `empty` | `envelope.case === null` | Card "Nenhuma pré-admissão ativa" |
| `active` | caso retornado | Checklist completa |
| `error` | exceção de rede / 403 | Card de erro com link para /minha-area |
| **Item: pendente** | `item.status === 'pending'` | Badge cinza + zona de upload |
| **Item: em análise** | `item.status === 'received'` | Badge âmbar + info do documento |
| **Item: aprovado** | `item.status === 'approved'` | Badge verde + info do documento |
| **Item: rejeitado** | `item.status === 'rejected'` | Badge vermelho + motivo + zona de re-upload |
| **Item: dispensado** | `item.status === 'waived'` | Badge azul, sem upload |
| **Upload: em andamento** | `handleUpload` chamado | Spinner inline no item |
| **Upload: sucesso** | API retorna 201 | Caso recarregado (status do item atualizado) |
| **Upload: erro** | exceção / arquivo grande | Mensagem vermelha + nova zona de upload |

## Tratamento de erros

| Status | Comportamento |
|---|---|
| 401 | Redirect automático para `/login` |
| 403 | Mensagem "perfil incompleto" com link para /minha-area (endpoint requer `CurrentCompleteCandidateSession`) |
| Tamanho excedido | Validação client-side antes de chamar a API (usa `item.maxFileSizeMb`) |
| Outros erros de upload | Mensagem de erro inline por item (via `detail` da API) |

## Download

O endpoint `GET .../documents/{id}/download` retorna um `FileResponse` (não JSON).

Abordagem: `window.open(url, '_blank')` onde `url` é construída a partir de `publicApiClient.baseUrl`. O browser envia o cookie `candidate_portal_session` automaticamente porque `SameSite=Lax` permite cookies em navegações top-level cross-site.

## Campos não exibidos ao candidato

- `notes` (interno do caso) — não está no schema candidate-facing
- `review_notes` (do documento — nota interna de RH) — não está em `CandidatePortalPreAdmissionUploadedDocumentResponse`
- `reviewed_by`, `created_by`, `hiring_decision_id` — IDs internos
- `ready_for_export`, eventos internos — campos de Protheus/ERP

## O que continua mockado

Nada. Todos os fluxos do candidate-portal estão agora integrados com a API real:

| Fluxo | Status |
|---|---|
| Vagas públicas | ✓ integrado (C3A) |
| Candidatura pública | ✓ integrado (C3B.1) |
| Login / Logout | ✓ integrado (C3C) |
| Área do candidato (overview) | ✓ integrado (C3C) |
| Avaliação comportamental | ✓ integrado (C3D) |
| Pré-admissão e documentos | ✓ integrado (C3E) |

Os componentes `DocumentChecklist.tsx` e `UploadMockCard.tsx` permanecem no projeto mas não são mais usados pela página de pré-admissão.

## Builds

```bash
npm --prefix candidate-portal run build   # ✓ tsc + vite — sem erros
npm --prefix frontend run build           # ✓ sem alterações
```

## Próxima fase

**C3F** — hardening/UX final do portal integrado.
