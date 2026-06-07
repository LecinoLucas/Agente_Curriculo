# Resultados do Teste E2E

| Cenário | Resultado esperado | Resultado obtido | Status |
| :--- | :--- | :--- | :--- |
| **Teste não fica skipped** | O teste roda integralmente no Playwright | O teste rodou e passou em 4.9s | ✅ GO |
| **Abertura da Rota** | `/admission/cases/...` carrega com sucesso | Rota carregada, UI de admissão exibida | ✅ GO |
| **Abertura do Assistente** | Drawer abre mostrando a interface da IA | Drawer aberto e focado | ✅ GO |
| **Contexto Admissional** | O assistente reconhece o pacote e as opções de admissão | Sugestões de admissão e informações contextuais carregadas | ✅ GO |
| **Comando de Diagnóstico** | "O que falta para exportar essa admissão?" executa e traz status | Consulta composta realizada e retornada com evidências | ✅ GO |
| **Renderização Composta** | Exibe resumo, status, eventos e regras da base | Renderizado corretamente com base em 5 steps | ✅ GO |
| **Bloqueio de Escrita** | "Exportar agora para Protheus" é bloqueado sem bater em endpoint de escrita | Bloqueado na validação de permissões/intenções | ✅ GO |
| **Navegação no Histórico** | Ao clicar no histórico, a resposta anterior é recarregada sem nova requisição | Histórico recarregado da sessão, `assistantCallCount` não aumentou | ✅ GO |
| **Protheus Fake/Real Isolado** | Não executa Protheus real | Nenhuma integração real disparada, modo mock ativado | ✅ GO |
| **Ocultação de PII (CPF)** | O CPF verdadeiro do candidato não aparece na resposta formatada | CPF `00000000000` não aparece no frontend | ✅ GO |
| **Ocultação de PII (Telefone)** | O telefone do candidato não aparece na resposta | Redação confirmada | ✅ GO |
| **Ocultação de PII (E-mail)** | O e-mail verdadeiro não aparece na resposta | E-mail `qa.admissional@example.test` não aparece | ✅ GO |
| **Ocultação de Dados Técnicos** | `payload_json`, `review_notes`, `content_hash`, `vector_json`, `embedding`, stack traces omitidos | Todos os termos técnicos da lista negra omitidos ou traduzidos | ✅ GO |
