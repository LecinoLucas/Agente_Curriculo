---
name: ai-analysis
description: Motor de Inteligência Artificial — adapters (Gemini/Claude), parsers de resposta, gerenciamento de prompts e lógica de avaliação (deal breakers, ranking).
---

## Objetivo

Garantir a integridade, precisão e consistência das análises geradas por IA, respeitando os contratos de dados e as regras de domínio.

## Quando usar

- Ao modificar adapters de modelos de IA (`gemini_adapter`, `claude_adapter`).
- Ao alterar o `response_parser` ou schemas de saída da IA.
- Ao atualizar prompts em `infrastructure/ai/prompts/`.
- Ao implementar ou ajustar lógica de ranking, deal breakers ou eligibility engine.

## Regras principais

- Uma análise IA só pode ser criada se houver: candidato + currículo + vaga ativa.
- O backend é o único responsável por disparar a criação de análises.
- Adapters devem isolar a complexidade específica de cada provedor (Gemini/Claude).
- O `response_parser` deve ser robusto a falhas parciais na resposta da IA.
- Prompts devem ser versionados e mantidos em arquivos separados.
- Resultados da IA devem ser validados antes de serem persistidos ou usados para score.
- O motor de ranking deve usar pesos consistentes entre as vagas do mesmo tenant.

## Nunca fazer

- Nunca criar análise IA sem uma vaga ativa vinculada via pipeline.
- Nunca deixar o frontend decidir os parâmetros de análise ou pesos de score.
- Nunca embutir prompts longos diretamente no código dos serviços.
- Nunca ignorar erros de parsing — trate falhas de formato da IA com retentativa ou erro controlado.
- Nunca misturar lógica de extração de currículo com lógica de avaliação de vaga.

## Checklist antes de concluir

- [ ] Candidato possui pipeline ativo antes de iniciar análise?
- [ ] Schema da resposta da IA está atualizado no `response_parser`?
- [ ] O prompt foi testado para o novo modelo/versão?
- [ ] O score resultante pertence exclusivamente à vaga ativa?
- [ ] Existe tratamento de erro para respostas inválidas da IA?
