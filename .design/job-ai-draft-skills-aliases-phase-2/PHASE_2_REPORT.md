# Fase 2 — IA gerar skills com aliases no rascunho da vaga

## Problema

O rascunho de vaga com IA retornava apenas listas simples de `mandatory_skills` e `nice_to_have_skills`.
Isso não permitia:

- preservar aliases sugeridos pela IA;
- comparar a sugestão com o catálogo já existente;
- distinguir skill já existente, skill nova e conflito potencial;
- exibir esse contexto no frontend antes de aplicar o rascunho.

## Solução implementada

O payload do Job AI Draft foi expandido de forma aditiva. O backend continua retornando:

- `mandatory_skills`
- `nice_to_have_skills`

e agora também retorna:

- `draft.suggested_skills[]`

Cada item de `suggested_skills` contém:

- `name`
- `category`
- `aliases[]`
- `description`
- `importance`
- `source`
- `catalog_status`
- `catalog_skill_id`
- `catalog_skill_name`
- `catalog_matched_by`
- `catalog_conflicts`

## Regras de comparação com catálogo

O backend compara nome e aliases usando a mesma normalização da Fase 1:

- lowercase
- remoção de acentos
- trim
- colapso de espaços duplicados

Classificação aplicada:

- `existing`: nome ou alias bate em uma única skill do catálogo
- `new`: nenhuma correspondência encontrada
- `conflict`: a sugestão aponta para mais de uma skill candidata no catálogo

## Prompt da IA

O prompt foi atualizado para exigir `suggested_skills` estruturadas e aliases úteis, evitando aliases genéricos demais.

Exemplos esperados:

- `Suporte Protheus`
- aliases: `TOTVS Protheus`, `ERP Protheus`, `Suporte TOTVS`

## Frontend

O painel `Criar vaga com IA` agora exibe, no resultado do rascunho:

- skills sugeridas por importância
- aliases sugeridos
- badge de status do catálogo
- skill correspondente do catálogo, quando houver
- lista de conflitos, quando houver

O comportamento de aplicar o rascunho ao formulário não mudou.

## O que não foi feito

- nenhuma skill nova é criada automaticamente no banco
- não houve alteração em benefícios
- não houve alteração em salário
- não houve modal final de revisão da vaga
- não houve alteração em matching/ranking
- não houve alteração em endpoints de criação manual da vaga

## Compatibilidade

O payload continua compatível com a criação manual porque:

- `mandatory_skills` e `nice_to_have_skills` permanecem no mesmo formato
- `suggested_skills` é apenas um campo adicional de leitura do rascunho

## Exemplo de payload

### Antes

```json
{
  "draft": {
    "mandatory_skills": ["Atendimento ao cliente"],
    "nice_to_have_skills": ["Experiência em varejo"]
  }
}
```

### Depois

```json
{
  "draft": {
    "mandatory_skills": ["Atendimento ao cliente"],
    "nice_to_have_skills": ["Experiência em varejo"],
    "suggested_skills": [
      {
        "name": "Atendimento ao cliente",
        "category": "behavioral",
        "aliases": ["Atendimento ao público", "Customer service"],
        "description": "Contato direto com clientes no ponto de venda.",
        "importance": "essential",
        "source": "ai_suggested",
        "catalog_status": "existing",
        "catalog_skill_id": "skill-atendimento",
        "catalog_skill_name": "Atendimento ao cliente",
        "catalog_matched_by": ["Atendimento ao cliente"],
        "catalog_conflicts": []
      }
    ]
  }
}
```

## Testes executados

- `cd backend && .venv/bin/python -m pytest tests/unit/test_job_ai_draft_service.py tests/integration/test_job_ai_draft_generate.py`
- `cd frontend && npm run test -- --run JobAiDraftPanel`
- `cd frontend && npm run test -- --run JobFormPage`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

## Riscos restantes

- o caminho `LangGraph` não recebeu teste dedicado para esse enriquecimento; a anotação é aplicada no serviço após o resultado do graph, mas o contrato validado aqui ficou no fluxo procedural e no endpoint HTTP.
