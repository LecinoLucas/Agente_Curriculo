# Admission Flow Results

| Cenário | Entrada | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| Abrir rota admissional QA | `/admission/cases/e3fa2a43-7659-4aa6-baeb-3791e8e3cedd?packageId=7a118208-2ee7-42fc-8042-573dcd44cce6` | workspace carrega sem 404/403 | `AdmissionCaseWorkspacePanel` abriu com header do caso e candidato QA | Pass |
| Abrir drawer | clique em `topnav-open-assistant` | drawer visível | drawer abriu normalmente | Pass |
| Contexto admissão | rota admissional aberta | label indica admissão | `Contexto atual: Admissão` visível | Pass |
| Sugestões admissionais | rota admissional aberta | atalhos admissionais e knowledge disponíveis | sugestões de export readiness, documentos e base apareceram | Pass |
| Texto livre controlado | `O que falta para exportar essa admissão?` | classifica fluxo admissional | executou composite admissional | Pass |
| Resposta composta | pergunta composta | steps read-only com degradação amigável se necessário | executou 5 consultas read-only: caso, documentos, eventos, knowledge e status Protheus | Pass |
| Pendências da admissão | resposta composta | comunica pendências reais da seed | exibiu `Comprovante de residência`, `Dados bancários` e `ASO` | Pass |
| Status Protheus | composite com `packageId` | consulta somente leitura | exibiu `Status Protheus` sem ação de envio | Pass |
| Ausência de sensíveis | composite/resultados | não exibir `cpf`, `phone`, `payload_json`, `review_notes`, `internal_notes`, `content_hash`, `vector_json`, `embedding`, `api_key`, `traceback` | após correção do sanitizador, conteúdo final ficou limpo | Pass |
| Bloqueio de escrita | `Exportar agora para Protheus` | bloqueia sem chamar endpoint | feedback amigável e contagem de requests ao assistant permaneceu inalterada | Pass |
| Histórico | executar composite, voltar e reabrir | reabre sem nova chamada | item apareceu no histórico e reabriu sem incremento de requests | Pass |
| Endpoint read-only | intents admission/protheus com seed QA | `ok=true` sem sensíveis | os quatro intents responderam com `ok=true` e sem campos sensíveis proibidos | Pass |
| Protheus real | fluxo completo | não executar envio real | nenhum envio real observado | Pass |
| Dependência externa de knowledge | composite com knowledge habilitado | idealmente sem dependência externa em QA | foi observado request real de embedding durante `knowledge.search` | Risk |
