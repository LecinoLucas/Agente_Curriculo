# PROTHEUS-EXPORT-CONTRACT-GAPS-1

## Objetivo

Fechar dois gaps de contrato backend para o dashboard operacional Protheus:

- entregar `unit_name` na listagem global quando o dado já existir no domínio;
- expor uma ação segura de nova solicitação/retry para a UI sem abrir caminho de envio real.

## Escopo executado

- [x] Revisar endpoint que alimenta o dashboard global da fila
- [x] Revisar schemas de resposta Protheus export queue/dashboard
- [x] Enriquecer `unit_name` por join leve com caso admissional e unidade operacional
- [x] Cobrir contrato de `unit_name` com teste backend
- [x] Revisar modelo atual de `can_request_new` e idempotência
- [x] Expor endpoint seguro `request-new` para nova solicitação em modo STUB/dry-run
- [x] Garantir bloqueio por permissão e por status não elegível
- [x] Garantir comportamento idempotente em duplicidade
- [x] Ajustar frontend mínimo para usar o endpoint seguro já compatível com a ação existente
- [x] Ajustar testes frontend afetados pelo novo contrato
- [x] Documentar resultado e riscos restantes

## Fora de escopo mantido

- [x] Nenhuma migration
- [x] Nenhuma alteração de regra de admissão
- [x] Nenhum envio real Protheus/ExecAuto
- [x] Nenhuma remoção de masking de dados sensíveis
