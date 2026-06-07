# JOB-AI-FIX-2A - Testes de salário e benefícios

## Cenários testados

- Input com `6x1`, `44h`, `2 anos`, `3 vagas` e turno, sem termo salarial, remove salário retornado pela IA.
- Input com `salário R$ 3000` preserva salário.
- Input com `faixa salarial de R$ 2500 a R$ 3500` preserva faixa salarial.
- Input com cargo comum e salário retornado pela IA remove salário.
- Input com `remuneração mensal 4000` preserva salário.
- Warning `salary_removed_no_source_evidence` aparece quando salário é removido.
- Input sem benefícios e IA retornando `Vale-transporte` remove o benefício.
- Input sem benefícios e IA retornando múltiplos benefícios remove todos.
- Input com `vale transporte` preserva somente `Vale-transporte`.
- Input com `plano de saúde` preserva somente `Plano de saúde`.
- Input com `vale transporte` e IA retornando `Vale-transporte` mais `Plano de saúde` preserva somente VT.
- Warning `benefit_removed_no_source_evidence` aparece quando benefício é removido.
- Ausência de benefícios não gera `missing_benefits`.
- `quality_score` não cai apenas por ausência de benefícios.
- Warnings continuam como lista de strings, sem quebrar contrato frontend.
- Guardrails antidiscriminatórios existentes continuam passando.
- Deduplicação case-insensitive de skills continua passando.
- Testes usam provider mockado e não chamam Gemini/Claude real.

## Resultado

Comando executado:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
source .venv/bin/activate
pytest tests/unit/test_job_ai_draft_service.py -v
```

Resultado:

```text
71 passed, 3 warnings
```

## Cobertura ainda pendente

- Testes de abreviações de benefícios, como `VT`, `VA` e `VR`, não foram adicionados porque a fase exige evidência explícita conservadora por item.
- Testes end-to-end com provider real não foram executados e permanecem fora de escopo.
- Frontend tem regressão mínima separada, sem alteração de UI nesta fase.
