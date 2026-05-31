# C3D — Avaliação Comportamental Real (candidate-portal)

## Endpoints consumidos

| Método | Endpoint                                                          | Usado em                        |
|--------|-------------------------------------------------------------------|---------------------------------|
| GET    | `/api/v1/public/candidate-portal/behavioral-assessments`         | `CandidateAssessmentPage` — mount |
| GET    | `/api/v1/public/candidate-portal/behavioral-assessments/{id}`    | após start / load in_progress    |
| POST   | `/api/v1/public/candidate-portal/behavioral-assessments/{id}/start`   | botão "Iniciar"             |
| PUT    | `/api/v1/public/candidate-portal/behavioral-assessments/{id}/answers` | "Salvar e continuar depois" |
| POST   | `/api/v1/public/candidate-portal/behavioral-assessments/{id}/submit`  | botão "Finalizar"           |

## Arquivos alterados

| Arquivo | Tipo |
|---|---|
| `src/services/publicApiClient.ts` | Adicionado método `put<T>(path, body)` para PUT JSON |
| `src/services/candidateAssessmentService.ts` | **Novo** — tipos de API, mappers, 5 métodos do serviço |
| `src/pages/CandidateAssessmentPage.tsx` | Reescrito — máquina de estados, todos os tipos de pergunta |

## Mapeamento API → frontend

### `BehavioralAssignmentSummaryResponse` → `AssessmentSummary`

| Campo API | Campo interno | Nota |
|---|---|---|
| `id` | `id` | |
| `job_title` | `jobTitle` | |
| `template_name` | `templateName` | |
| `status` | `status` | `pending \| in_progress \| submitted \| expired` |
| `assigned_at` | `assignedAt` | |
| `started_at` | `startedAt` | |
| `submitted_at` | `submittedAt` | |
| `expires_at` | `expiresAt` | |
| `answered_count` | `answeredCount` | |
| `question_count` | `questionCount` | |
| `ai_evaluation_status` | **omitido** | campo interno — não exibido ao candidato |

### `BehavioralAssignmentDetailResponse` → `AssessmentDetail`

Herda o sumário e adiciona:

| Campo API | Campo interno |
|---|---|
| `competencies[].name` | `competencies[].name` |
| `competencies[].description` | `competencies[].description` |
| `competencies[].display_order` | `competencies[].displayOrder` (usado para ordenação) |
| `competencies[].questions[]` | `competencies[].questions[]` |
| `questions[].question_text` | `questions[].text` |
| `questions[].answer_type` | `questions[].answerType` |
| `questions[].is_required` | `questions[].isRequired` |
| `questions[].options_json` | `questions[].optionsJson` (passado bruto ao parser) |
| `questions[].answer` | `questions[].savedAnswer` (inicializa o estado local) |

## Tipos de pergunta suportados

| `answer_type` | Controle de UI | Campo de resposta enviado |
|---|---|---|
| `text` | `<textarea>` | `answer_text: string` |
| `scale` | Botões numerados (1–N, ou range de options_json) | `answer_value: number` |
| `multiple_choice` | Radio buttons (single-select) das opções em `options_json` | `selected_options_json: [string]` |
| outros | `<textarea>` (fallback) | `answer_text: string` |

### Parser de `options_json` para `scale`

Aceita os formatos:
- `null` → escala padrão 1–5
- `{"min": X, "max": Y, "labels": {...}}` → range com labels opcionais
- `[{"value": N, "label": "..."}]` → array de pontos com label
- `[N, N, N, ...]` → array de números

### Parser de `options_json` para `multiple_choice`

Aceita os formatos:
- `["Option A", "Option B"]` → array de strings
- `[{"value": "...", "label": "..."}]` → array de objetos

## Payload enviado

### PUT /answers — `BehavioralAssignmentAnswersRequest`

```json
{
  "answers": [
    { "question_id": "uuid", "answer_text": "texto", "answer_value": null, "selected_options_json": null },
    { "question_id": "uuid", "answer_text": null, "answer_value": 4, "selected_options_json": null },
    { "question_id": "uuid", "answer_text": null, "answer_value": null, "selected_options_json": ["opt_a"] }
  ]
}
```

Todas as respostas atuais são enviadas a cada PUT (upsert por question_id).

### POST /submit — `BehavioralAssignmentSubmitRequest`

Mesmo formato que PUT /answers. Submeter com todas as respostas atuais garante atomicidade (salva + finaliza em uma só chamada).

## Máquina de estados da página

```
loading  ──(list loaded, empty)──────────────→ empty
         ──(list loaded, pending)────────────→ pending
         ──(list loaded, in_progress)─────────→ active (+ GET detail)
         ──(list loaded, submitted)──────────→ submitted (+ GET detail)
         ──(list loaded, expired)────────────→ expired
         ──(401)──────────────────────────────→ redirect /login
         ──(error)────────────────────────────→ error

pending  ──(click Iniciar)──────────────────→ starting → active
         ──(409 already started)────────────→ active (retry GET detail)

active   ──(click Salvar)───────────────────→ saving → /minha-area
         ──(click Finalizar)─────────────────→ submitting → submitted
         ──(error)────────────────────────────→ active (inline error)

submitted → terminal (só link de volta)
expired   → terminal
empty     → terminal
```

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| 401 (sessão expirada) | Redirect automático para `/login` |
| 409 no start (já iniciada) | Tenta GET detail e continua no `active` |
| 409 no submit (já enviada) | Erro inline no formulário |
| 422 (resposta inválida) | Erro inline: mensagem do backend via `detail` |
| Rede | Erro inline ou estado `error` com botão de retry |

## O que continua mockado

| Fluxo | Mock |
|---|---|
| Pré-admissão (`CandidatePreAdmissionPage`) | `getPreAdmissionDocuments` + `uploadMockDocument` |

## Campos não exibidos ao candidato

- `ai_evaluation_status` — status interno do processamento de IA
- `template_id` — UUID interno do template
- `candidate_id`, `job_id` — IDs internos

## Builds

```bash
npm --prefix candidate-portal run build   # ✓ tsc + vite — sem erros
npm --prefix frontend run build           # ✓ sem alterações
```

## Próxima fase

**C3E** — pré-admissão real e upload de documentos.
