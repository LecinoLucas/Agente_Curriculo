# ERP-PAYLOAD-PRIVACY-GUARD-1

## Checklist

- [x] Buscar no frontend exibições diretas de `request_payload_json`, payload, dry-run payload, `JSON.stringify`, CPF, salário, email e telefone.
- [x] Buscar no backend logs/erros/audit events relacionados a payload ERP/Protheus.
- [x] Reutilizar/centralizar helper de masking/redaction.
- [x] Garantir que `ErpPayloadPreview.tsx` use helper testável.
- [x] Cobrir CPF mascarado.
- [x] Cobrir email mascarado.
- [x] Cobrir telefone mascarado.
- [x] Cobrir salário mascarado.
- [x] Cobrir payload nested mascarado.
- [x] Cobrir arrays mascarados.
- [x] Cobrir campos desconhecidos seguros preservados.
- [x] Cobrir que o helper não muta o objeto original.
- [x] Redigir payload em timeline de eventos admissionais.
- [x] Redigir payload em log frontend de erro 422.
- [x] Validar que snapshots/docs auditados não usam dados reais.
- [x] Preservar contrato HTTP backend de `request_payload_json`.
- [x] Rodar testes focados e build frontend.

## Resultado

Conclusão: PASS_WITH_NOTES.

Notas:
- Backend não foi alterado porque não foi encontrado logger ERP imprimindo payload cru e o contrato autorizado de `request_payload_json` deve permanecer inalterado nesta fase.
- O risco residual é a própria existência do payload técnico completo na resposta HTTP autorizada, que exige decisão de contrato em uma frente separada se for necessário redigir também no backend.
