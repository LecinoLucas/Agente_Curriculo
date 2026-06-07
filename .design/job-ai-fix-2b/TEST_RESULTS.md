# JOB-AI-FIX-2B - Resultados de testes

## Backend

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
source .venv/bin/activate
pytest tests/unit/test_job_ai_draft_service.py -v
```

Resultado:

```text
84 passed, 3 warnings
```

Cobertura conferida:

- anos explícitos preservados;
- senioridade e números soltos não geram anos;
- `6 meses` convertido para `0.5`;
- escolaridade explícita preservada;
- escolaridade inferida por cargo removida;
- contexto de experiência explícito preservado;
- contexto inventado reduzido para evidência real;
- regressões de salário e benefícios da fase 2A continuam passando;
- guardrails antidiscriminatórios continuam passando;
- provider de IA mockado, sem chamada real a Gemini/Claude.

## Frontend

Comandos:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npx tsc --noEmit
npm run test -- --run JobAiDraftPanel
```

Resultados:

```text
TypeScript: No errors found
JobAiDraftPanel: 34 passed
```

Regressões conferidas:

- `applyApiDraftToForm` aplica `experience_context`;
- `applyApiDraftToForm` aplica `minimum_education_level`;
- `applyApiDraftToForm` aplica `minimum_years_experience`;
- valores `null` e strings vazias não sobrescrevem campos existentes;
- preview exibe os novos campos;
- warnings novos são renderizados de forma legível;
- salary segue fora do mapeamento para formulário;
- benefícios continuam dependendo do backend já filtrado por evidência.
