# Matriz de Acesso: Gestor G1

## Regra Base
O gestor acessa candidatos apenas por vinculo explicito ja existente:

- `review_request` com `target_manager_id` do gestor.
- `interview_scorecard` com `evaluator_id` do gestor.
- Vinculos pontuais equivalentes ja modelados pelo fluxo atual.

Nao existe escopo por departamento, unidade ou gestor responsavel da vaga nesta fase.

## Respostas Esperadas

| Recurso | Condicao | Resposta |
| --- | --- | --- |
| `GET /manager/jobs` | Usuario com papel `MANAGER` sem atribuicoes | `200 { jobs: [] }` |
| `GET /manager/jobs` | Gestor com scorecard ou review request direcionado | `200` com vagas acessiveis |
| `GET /manager/jobs` | Usuario sem papel permitido | `403` |
| `GET /manager/jobs/{job_id}/candidates` | Gestor tem acesso a vaga, mas nenhum candidato ativo visivel | `200 { candidates: [] }` |
| `GET /manager/jobs/{job_id}/candidates` | Gestor tem candidatos ativos visiveis por atribuicao explicita | `200` apenas com candidatos atribuidos |
| `GET /manager/jobs/{job_id}/candidates` | Gestor nao tem vinculo explicito com a vaga | `403` |
| `GET /manager/jobs/{job_id}/candidates/{candidate_id}/summary` | Gestor tem scorecard ou review request para candidato/vaga | `200` resumo seguro |
| `GET /manager/jobs/{job_id}/candidates/{candidate_id}/summary` | Candidato nao atribuido ao gestor nessa vaga | `403` |
| Scorecard de entrevista | Gestor e avaliador do scorecard/candidato | `200` conforme fluxo existente |
| Scorecard de entrevista | Gestor nao e avaliador e nao tem acesso ao candidato | `403` |

## Contadores

- `candidate_count`: candidatos ativos visiveis para o gestor naquela vaga.
- `assigned_count`: candidatos visiveis com scorecard do proprio gestor.

O contador nao representa mais o total bruto da vaga para usuarios `MANAGER`.

## Mensagens

- Sem acesso a vaga: `Gestor nao tem acesso a esta vaga.`
- Sem acesso a candidato/vaga: `Gestor nao tem acesso a este candidato nesta vaga.`
- Vaga acessivel sem candidatos ativos visiveis: estado vazio, nao erro.

