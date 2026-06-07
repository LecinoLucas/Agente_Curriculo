# AI Assistant QA Fixes 1

## Risco corrigido

- Removido `phone` do payload bruto de `candidate.summary` no backend das tools do Assistente IA.
- Reforçada a cobertura para impedir exposição de `phone`, `cpf`, `salary_expectation` e `internal_notes` no summary.
- Reforçada a cobertura para garantir que `candidate.resume_analysis` não retorna texto bruto de currículo.

## Campos removidos

- `candidate.summary`: `phone`

## Testes executados

- `pytest tests/unit/test_ai_candidate_tools.py -v`
- `pytest tests/unit/test_ai_assistant_endpoint.py -v`
- `pytest tests/unit/test_ai_tool_runtime.py -v -o addopts='' -p no:cov`
- `pytest tests/unit/test_ai_knowledge_tools.py -v`
- `npx tsc --noEmit`
- `npm run test -- --run AiAssistantDrawer`

## Mitigação de artefatos coverage locais

- Ajustado `.gitignore` para cobrir `.coverage*`, incluindo arquivos locais como `.coverage.*`.
- Artefato local de coverage corrompido removido do diretório `backend/`.
- `tests/unit/test_ai_tool_runtime.py` precisou rerun com `-o addopts='' -p no:cov` após reproduzir falha local de `pytest-cov` no teardown.
- Se `pytest-cov` voltar a falhar por arquivo local corrompido, o problema deve ser tratado como ambiental/local, não como regressão da feature.

## Pendências

- Validação visual completa continua dependente de Chromium disponível no ambiente.
- Validação admissional real continua dependente de seed de `pre_admission_cases`.

## Confirmações

- Nenhuma UI foi alterada.
- Nenhum endpoint novo foi criado.
- Nenhuma feature nova foi introduzida.
- Protheus real continua desligado.
- Fluxo de free text do assistente continua desligado.
