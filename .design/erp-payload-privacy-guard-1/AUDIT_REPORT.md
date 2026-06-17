# ERP-PAYLOAD-PRIVACY-GUARD-1

## Resumo executivo

Conclusão: PASS_WITH_NOTES.

Foi aplicado hardening de privacidade nas camadas de apresentação e log frontend relacionadas a payloads ERP/Protheus/admissionais. O contrato HTTP backend que retorna `request_payload_json` para staff autorizado foi preservado por decisão explícita de escopo.

Nenhuma migration foi criada, nenhuma regra de negócio foi alterada e nenhum envio real ERP/Protheus foi habilitado.

## Pontos auditados

- Frontend: `request_payload_json`, `payload_json`, `JSON.stringify`, `cpf`, `email`, `phone`, `telefone`, `salary_offer` em componentes admissionais/ERP.
- Frontend: preview técnico Protheus, preview de pacote admissional, timeline de eventos admissionais e log de erro 422 no cliente HTTP.
- Backend: serviços/rotas ERP Protheus com `request_payload_json`, `response_payload_json` e padrões `logger.*payload`.
- Testes/fixtures: fixtures frontend ERP/Protheus e exemplos em `.design/protheus-export-operational-smoke-1`.

## Vazamentos encontrados

- `AdmissionPackagePreview.tsx` exibia email, telefone, CPF e salário ofertado diretamente.
- `PreAdmissionEventTimeline.tsx` renderizava `payload_json` com `JSON.stringify` sem redaction.
- `services/http.ts` imprimia payload completo de erro 422 em `console.error`.
- `ErpPayloadPreview.tsx` já estava mascarando o JSON técnico, mas a lógica estava local ao componente e não cobria reutilização/testes unitários do helper.

Não foi encontrado logger backend ERP imprimindo payload cru. A rota backend ainda retorna `request_payload_json` por contrato autorizado, conforme decisão residual desta fase.

## Correções aplicadas

- Criado helper compartilhado `redactSensitivePayload` em `frontend/src/shared/utils/sensitiveDataMasking.ts`.
- Helper cobre CPF, RG, email, telefone/celular, salário/remuneração, endereço, dados bancários, nome da mãe/pai, PIS/PASEP/CTPS.
- Helper preserva campos desconhecidos seguros, redige payloads nested e arrays, redige CPF/e-mail em texto livre e não muta o objeto original.
- `ErpPayloadPreview.tsx` passou a usar helper compartilhado para o JSON expandido e helpers testáveis para resumo.
- `AdmissionPackagePreview.tsx` passou a mascarar email, telefone, CPF e salário.
- `PreAdmissionEventTimeline.tsx` passou a redigir `payload_json` antes de renderizar.
- `services/http.ts` passou a redigir payload de erro 422 antes de logar no console.

## Arquivos alterados

- `frontend/src/shared/utils/sensitiveDataMasking.ts`
- `frontend/src/shared/utils/__tests__/sensitiveDataMasking.test.ts`
- `frontend/src/features/candidates/drawer/components/ErpPayloadPreview.tsx`
- `frontend/src/features/candidates/drawer/components/__tests__/ErpPayloadPreview.test.tsx`
- `frontend/src/features/candidates/drawer/components/AdmissionPackagePreview.tsx`
- `frontend/src/features/candidates/drawer/components/__tests__/AdmissionPackagePanel.test.tsx`
- `frontend/src/features/candidates/drawer/components/PreAdmissionEventTimeline.tsx`
- `frontend/src/features/candidates/drawer/components/__tests__/PreAdmissionEventTimeline.test.tsx`
- `frontend/src/services/http.ts`

## Testes executados

- `npm --prefix frontend test -- --run src/shared/utils/__tests__/sensitiveDataMasking.test.ts src/features/candidates/drawer/components/__tests__/ErpPayloadPreview.test.tsx src/features/candidates/drawer/components/__tests__/ErpDryRunPanel.test.tsx src/features/candidates/drawer/components/__tests__/AdmissionPackagePanel.test.tsx src/features/candidates/drawer/components/__tests__/PreAdmissionEventTimeline.test.tsx`
  - Resultado final: 5 arquivos, 31 testes passed.
- `npm --prefix frontend test -- --run src/features/admission-workspace/__tests__/AdmissionProtheusExportQueuePanel.test.tsx src/features/admission-workspace/__tests__/AdmissionProtheusBridgeSummaryPanel.test.tsx src/features/candidates/drawer/components/__tests__/AdmissionProtheusIntegrationPanel.test.tsx src/features/admission-workspace/__tests__/AdmissionProtheusIntegrationPanel.test.tsx`
  - Resultado: 4 arquivos, 34 testes passed.
- `npm --prefix frontend run build`
  - Resultado: `tsc --noEmit` e Vite build passed.

## Decisão sobre contrato HTTP

O contrato backend não foi alterado. `request_payload_json` continua sendo retornado pela API para staff autorizado, conforme desenho atual e nota residual da frente anterior.

Esta frente protegeu somente apresentação/logs/testes conhecidos, sem remover payload técnico autorizado da resposta HTTP.

## Riscos restantes

- A API autorizada ainda carrega payload técnico completo; isso deve ser tratado em uma decisão de contrato separada se o produto quiser redaction também na camada HTTP.
- O helper usa redaction por nome de chave e padrões comuns de CPF/e-mail; campos sensíveis com nomes novos podem exigir expansão da lista.
- Fixtures de teste continuam usando dados sintéticos (`example.com`, CPFs fictícios) para validar redaction; não são dados reais.
