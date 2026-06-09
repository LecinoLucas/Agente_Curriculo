# Bugs Found

| ID | Severidade | Camada | Descrição | Evidência | Recomendação |
|---|---|---|---|---|---|
| E2E-PREADM-001 | Low | Test infra | O spec Playwright preparado para `/admissao/:caseId` não executa cenário útil sem `PREADMISSION_E2E_CASE_ID` real no ambiente local. | `npx playwright test ...` encerrou com `PASS (0) FAIL (0)` e `exit code 1`. | Rodar com massa local explícita e `caseId` válido, ou automatizar setup E2E completo em ambiente dedicado. |
| E2E-PREADM-002 | Medium | Backend teste legado | `tests/integration/test_admission_case_workspace.py::test_workspace_blocks_case_when_pipeline_is_inactive` falhou esperando `422`, mas o endpoint respondeu `200`. | suíte `test_admission_case_workspace.py` falhou 1/13 fora do fluxo validado desta fase. | Revisar se a regra foi flexibilizada intencionalmente ou se o teste ficou defasado. |

## Sem novos bugs de contrato nesta fase

Não foi encontrado bug novo no contrato de:

- `final -> offer`
- `offer -> hired`
- `hired -> pre_admission`
- `open_pre_admission` sem `pre_admission_case_id`
