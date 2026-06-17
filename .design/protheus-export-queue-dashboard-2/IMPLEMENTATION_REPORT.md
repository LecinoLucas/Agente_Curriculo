# PROTHEUS-EXPORT-QUEUE-DASHBOARD-2

## Resumo

Conclusão: PASS_WITH_NOTES.

O dashboard/fila Protheus foi evoluído para uma visão mais operacional sem tocar backend, sem criar migration e sem abrir qualquer caminho de envio real. A UI continua em modo seguro, com indicação explícita de STUB e sem exibir payload técnico sensível.

## O que mudou

### Dashboard operacional

- Resumo trocado para métricas mais úteis ao RH:
  - total de solicitações;
  - pendentes;
  - em processamento;
  - com erro;
  - bloqueadas;
  - concluídas;
  - retry agendado;
  - última atualização visível.
- Banner de flags operacionais no topo:
  - modo seguro STUB;
  - bridge habilitada;
  - envio real bloqueado.
- Bloco de erros mais frequentes com tradução operacional.

### Lista de solicitações

- Cada item agora mostra:
  - candidato, via enriquecimento com `getOverview(caseId)` para a página visível;
  - vaga, quando disponível no overview;
  - status humanizado;
  - última tentativa;
  - tentativas realizadas;
  - próximo retry;
  - erro traduzido;
  - badge STUB/dry-run seguro;
  - status do payload, quando existir.
- O fallback continua seguro quando o snapshot não tem contexto suficiente:
  - candidato não disponível;
  - vaga/unidade indisponível no snapshot seguro.
- Detalhes expandíveis continuam sem expor API keys, CPF, PIS, CTPS, payload operacional ou outros segredos.

### Filtros

- Mantido filtro backend por status já existente.
- Adicionados filtros locais simples:
  - busca por candidato ou caso;
  - somente erros;
  - somente pendentes;
  - somente concluídos;
  - todos.
- Empty states ficaram contextuais para:
  - busca sem resultado;
  - nenhum erro;
  - nenhum pendente;
  - nenhum concluído;
  - fila vazia genérica.

### Painel no Admission Workspace

- O painel do caso agora destaca:
  - badge STUB/dry-run seguro;
  - status do payload;
  - última tentativa.
- Quando `can_request_new=true`, a UI oferece apenas a ação segura já suportada:
  - `Solicitar nova exportação segura`
- Nenhum botão de envio real foi criado.
- Nenhum retry manual novo foi criado porque o contrato atual não expõe endpoint dedicado para isso.

## Privacidade e segurança

- Nenhum payload técnico foi adicionado à UI.
- Nenhum CPF, email, telefone ou salário foi introduzido em texto aberto.
- O hardening anterior de masking permanece intacto.
- A tela segue explícita sobre STUB e bloqueio de envio real.

## Arquivos alterados

- `frontend/src/features/admission-workspace/ProtheusExportQueueDashboardPage.tsx`
- `frontend/src/features/admission-workspace/AdmissionProtheusExportQueuePanel.tsx`
- `frontend/src/features/admission-workspace/__tests__/ProtheusExportQueueDashboardPage.test.tsx`
- `frontend/src/features/admission-workspace/__tests__/AdmissionProtheusExportQueuePanel.test.tsx`

## Testes executados

- `npm --prefix frontend test -- --run src/features/admission-workspace/__tests__/ProtheusExportQueueDashboardPage.test.tsx src/features/admission-workspace/__tests__/AdmissionProtheusExportQueuePanel.test.tsx`
  - Resultado: 33 testes passed.
- `npm --prefix frontend run build`
  - Resultado: `tsc --noEmit` e build Vite passed.

## Limites preservados

- Sem backend novo.
- Sem migration.
- Sem botão de envio real.
- Sem ExecAuto real.
- Sem alteração de regra de admissão.
- Sem alteração de pipeline.

## Riscos restantes

- O dashboard global ainda depende de chamadas adicionais de overview para exibir candidato/vaga; isso melhora a operação agora, mas não substitui um contrato backend consolidado.
- Unidade operacional ainda não está no snapshot seguro atual; por isso a UI usa fallback em vez de inferir ou inventar dado.
- Retry manual não foi exposto porque não existe endpoint seguro dedicado para a fila global nesta fase.
