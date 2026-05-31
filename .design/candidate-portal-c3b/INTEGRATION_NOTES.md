# C3B.1 — Candidatura Pública Real (candidate-portal)

## Endpoint consumido

| Método | Endpoint                          | Usado em                     |
|--------|-----------------------------------|------------------------------|
| POST   | `/api/v1/public/candidates/apply` | `ApplicationFormPage.tsx`    |

## Arquivos alterados

| Arquivo | Tipo |
|---|---|
| `src/services/publicApplicationService.ts` | **Novo** — monta FormData e chama `publicApiClient.postForm` |
| `src/pages/ApplicationFormPage.tsx` | Reescrito — form real, File object, erros de API |
| `src/routes/CandidatePortalRouter.tsx` | `/candidatar/:slug` → `/candidatar/:identifier` |

`src/services/publicApiClient.ts` não precisou de alteração — `postForm` já estava disponível desde C3C.

## FormData enviado

| Campo                   | Tipo no backend         | Fonte                                    |
|-------------------------|-------------------------|------------------------------------------|
| `full_name`             | `str` obrigatório       | Input nome completo                      |
| `cpf`                   | `str` obrigatório       | Input CPF — não-dígitos removidos        |
| `email`                 | `str` obrigatório       | Input e-mail                             |
| `phone`                 | `str` obrigatório       | Input telefone                           |
| `city`                  | `str` obrigatório       | Input cidade                             |
| `state`                 | `str` obrigatório       | Select UF — enviado em maiúsculas        |
| `salary_expectation`    | `str` opcional          | Input pretensão salarial                 |
| `desired_contract_type` | `CLT\|PJ\|Indiferente`  | Radio group                              |
| `works_at_marajo_group` | `bool`                  | Checkbox → `'true'` / `'false'`          |
| `job_id`                | `UUID\|None`            | Param `:identifier` da URL (UUID da vaga)|
| `lgpd_consent`          | `bool` obrigatório      | Checkbox LGPD → `'true'` / `'false'`    |
| `resume_file`           | `UploadFile`            | `<input type="file">` — `File` object real |

Campos removidos em relação ao protótipo mock: `birth_date`, `nationality`, `education_level`.

## Fluxo completo C3A → C3B → C3C

```
/vagas               → lista real (C3A)
/vagas/{uuid}        → detalhe real (C3A)
                       botão "Candidatar-se" → /candidatar/{uuid}
/candidatar/{uuid}   → formulário real (C3B.1)
                       submit → POST /candidates/apply
                       sucesso → /sucesso
/login               → login real (C3C)
/minha-area          → overview real (C3C)
```

## Validações client-side

- **Step 1 → 2**: full_name, CPF (dígitos > 0), email, phone, city, state, desired_contract_type obrigatórios
- **Step 2 → 3**: resume_file selecionado; limite de 10 MB verificado no service antes do envio
- **Step 3 → submit**: lgpd_consent marcado

## Tratamento de erros da API

| Status | Causa                                | Exibição                               |
|--------|--------------------------------------|----------------------------------------|
| 400    | Vaga indisponível / não publicada    | Mensagem da API (`detail`) no step 3  |
| 409    | CPF ou e-mail já cadastrado          | Mensagem da API (`detail`) no step 3  |
| 422    | Arquivo inválido / campo mal formado | Mensagem da API (`detail`) no step 3  |
| 500    | Erro do servidor                     | Mensagem da API (`detail`) no step 3  |
| Rede   | Backend indisponível                 | "Falha na conexão com o servidor."    |

## O que continua mockado

| Fluxo | Mock |
|---|---|
| Avaliação comportamental (`CandidateAssessmentPage`) | `getAssessmentQuestions` + `submitMockAssessment` |
| Pré-admissão (`CandidatePreAdmissionPage`) | `getPreAdmissionDocuments` + `uploadMockDocument` |

## Builds

```bash
npm --prefix candidate-portal run build   # ✓ tsc + vite — sem erros
npm --prefix frontend run build           # ✓ sem alterações
```

## Próxima fase

**C3D** — avaliação comportamental real (`GET/POST /api/v1/public/candidate-portal/behavioral-assessments/*`).
