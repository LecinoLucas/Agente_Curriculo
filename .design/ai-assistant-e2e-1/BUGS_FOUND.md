# Bugs Found

| ID | Severidade | Descrição | Evidência | Recomendação |
| --- | --- | --- | --- | --- |
| E2E-ADM-001 | Medium | A primeira execução do composite admissional exibiu `CPF` em texto livre vindo de evidência da base de conhecimento dentro do drawer | Falha inicial do Playwright em `qa-assistant-admission.spec.ts`; conteúdo do composite continha `cpf` | Corrigido nesta fase via sanitização adicional no frontend do assistente |
| E2E-ADM-002 | Medium | O composite admissional com `knowledge.search` disparou request real de embedding quando as credenciais do provedor estão presentes no ambiente | Log observado no backend durante o E2E: request para `gemini-embedding-001:embedContent` | Avaliar modo QA sem provedor externo ou flag explícita para knowledge read-only sem embeddings reais |

Nenhum bug bloqueante permaneceu aberto no fluxo visual após a correção de sanitização.
