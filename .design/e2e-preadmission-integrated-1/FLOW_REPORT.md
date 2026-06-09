# E2E-PREADMISSION-INTEGRATED-1

## Resumo

Validação integrada do fluxo `final -> offer -> hired -> pre_admission` foi concluída de forma **PARCIAL**:

- contrato backend do caminho feliz: **OK**
- contrato backend do cenário sem checklist padrão: **OK**
- abertura real do workspace admissional por `caseId` válido: **OK** via teste integrado backend
- navegação Playwright full UI: **não medida de ponta a ponta** neste ambiente, por depender de `caseId`/massa real local explícita

## Pré-condições usadas

### Caminho feliz

- usuário recrutador autenticado para mover o pipeline
- usuário admin autenticado para abrir o workspace admissional
- vaga criada via API
- candidato criado via API
- candidato vinculado à vaga
- candidato posicionado em `final`
- decisão `advance` submetida para liberar `final -> offer`
- decisão `hire` submetida para liberar `offer -> hired`
- checklist template padrão ativo garantido

### Cenário sem checklist

- candidato em `hired`
- decisão `hire` submetida
- nenhum checklist template padrão ativo

## Caminho feliz validado

1. `final -> offer` retorna `200`
2. `offer -> hired` retorna `200`
3. `hired -> pre_admission` retorna `200`
4. resposta traz `required_action="open_pre_admission"`
5. resposta traz `pre_admission_case_id` válido
6. `GET /api/v1/admission/cases/:caseId/workspace` retorna `200`
7. workspace traz `case`, `candidate`, `job` e checklist
8. nenhum `ErpIntegrationAttempt` foi criado
9. nenhum pacote foi marcado como exportado

## Cenário sem checklist validado

1. `hired -> pre_admission` retorna `409`
2. `required_action` volta como `configure_default_checklist_template`
3. `pre_admission_case_id` volta `null`
4. nenhum caso parcial é criado
5. nenhum pacote admissional é criado
6. candidato permanece em `hired`
7. não há evento de mudança para `pre_admission`

## Conclusão

- **Backend/API**: OK para o contrato final desta fase
- **Frontend/UI real**: parcial; o spec Playwright foi preparado, mas a execução útil depende de `PREADMISSION_E2E_CASE_ID` local válido
- **Protheus real**: não acionado neste fluxo validado
