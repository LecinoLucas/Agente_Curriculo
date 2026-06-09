# Payload Audit - AI Assistant Job Presenter

## Backend Tool: `get_job_summary`

### Payload Recebido (Exemplo Atual)
```json
{
  "id": "uuid-vaga",
  "title": "Analista De Dados Senior",
  "status": "published",
  "area": "data",
  "seniority": "senior",
  "location": "Goiania-GO",
  "work_model": "onsite",
  "mandatory_skills": [],
  "nice_to_have_skills": [],
  "created_at": "2024-03-20T10:00:00",
  "updated_at": "2024-03-20T11:00:00"
}
```

### Campos Usados pelo Frontend
- `title` (Summary)
- `status` (Summary)
- `area` (Summary)
- `seniority` (Metrics)
- `location` (Metrics)
- `work_model` (Metrics)
- `mandatory_skills` (Evidence/Pending)
- `nice_to_have_skills` (Evidence)

### Campos Descartados pelo Frontend
- `id` (Usado internamente talvez, mas não exibido)
- `created_at`
- `updated_at`

### Campos Ausentes no Payload (Mas desejados na UI)
- `priority` (Prioridade) - Presente no `JobModel.priority`
- `working_hours` (Jornada) - Presente no `JobModel.working_hours`
- `vacancies_count` (Quantidade de vagas) - Disponível via `job_units` no backend.

### Conclusão do Audit
O problema era misto e foi resolvido em duas frentes:
1. **Frontend/Presenter:** Traduz enums, mostra "Não informado" e utiliza novos campos como `vacancies_count`.
2. **Backend/Tool:** A tool `get_job_summary` e `get_job_requirements` foram enriquecidas para mesclar skills brutas com estruturadas (`skill_requirements`), além de incluir `priority`, `working_hours` e o somatório de vagas das unidades.

**Ação Concluída:**
- O Assistente agora reflete fielmente o cadastro real da vaga.
