# Services (Em Migração)

⚠️ **Esta pasta está em processo de migração para o padrão de `use_cases/`.**

## Orientação para Novos Desenvolvedores

### ✅ O que fazer
- **Novos fluxos devem ser implementados em `src/application/use_cases/`**
- Use a estrutura de use cases para novas funcionalidades
- Mantenha os padrões de command/result estabelecidos em use_cases

### ❌ O que não fazer
- **Não crie novas services aqui** — use use_cases
- Não expanda serviços existentes se puder evitar
- Esta pasta é para código legado que ainda está sendo refatorado

## Mapeamento de Status

### Services Ativas (Legado)
- `job_service.py` — Profiling e qualidade de vagas (sendo refatorado)
- `analysis_service.py` — Processamento de análises
- `resume_service.py` — Gerenciamento de currículos
- `candidate_ranking_service.py` — Ranking de candidatos
- E outras...

### Services que Devem ser Migradas
- Todas as novas features devem usar `use_cases/`
- Eventualmente, services aqui serão decompostas em use cases

## Estrutura de Use Cases (Padrão Novo)

```
src/application/use_cases/
├── auth/
│   ├── login/
│   │   └── login_use_case.py
│   └── ...
├── jobs/
│   ├── create_job/
│   └── ...
└── ...
```

Cada use case é auto-contido com seu próprio command, result, e lógica.

---

**Última atualização:** 2026-05-02
