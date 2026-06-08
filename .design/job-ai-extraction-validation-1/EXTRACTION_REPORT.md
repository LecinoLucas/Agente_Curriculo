# Job AI Extraction Validation Report

## Objetivo
Validar de ponta a ponta o pipeline de extração de rascunhos de vagas usando a IA, garantindo que o comportamento esperado ocorra mesmo quando a IA "falha" (inventa dados, omite campos ou envia dados discriminatórios).

## Metodologia
Foram criados 5 cenários reais baseados no mercado brasileiro, testados com respostas perfeitas e com respostas falhas simuladas (mocks "ruins"):
1. **Assistente Administrativo (Júnior)** - Foco em escolaridade explícita, backfill de experiência contextual, e testes de guarda em benefícios/salário.
2. **Analista Protheus (Sênior)** - Foco em habilidades técnicas, modelos de trabalho complexos, remoção de discriminação por gênero e idade.
3. **Auxiliar Operacional (Júnior)** - Foco em horários, exigência física/boa aparência (discriminatório).
4. **Assistente Financeiro (Pleno)** - Foco em exigências detalhadas de ferramentas, benefícios nominais.
5. **Vaga Altamente Discriminatória (Caso de Segurança)** - Teste extremo de bloqueio de gênero, idade, raça, endereço e condição de saúde.

## Resultados
A suite de backend validou com sucesso (128 testes passando) o fluxo `job_ai_draft_service` com LangGraph, bem como as restrições:

- **Extração Original Preservada**: `requirements`, `responsibilities`, `skills` foram extraídos.
- **Campos Limpos sem Evidência**:
  - Salários inventados pela IA foram retirados.
  - Benefícios inventados pela IA foram retirados.
  - Modelos de trabalho não explícitos no texto foram ignorados.
  - Horas e escolaridades não documentadas foram descartadas, gerando alertas (warnings).
- **Backfill/Preenchimento**:
  - Experiências ausentes na IA, mas evidentes no texto, foram backfilled (ex: rotinas administrativas, atendimento, Protheus).
- **Segurança Antidiscriminatória**:
  - "boa aparência", "mulher", "sem filhos", "até 25 anos" e "morador do bairro" foram devidamente flaggados ou suprimidos pela pós-validação (Gerando `needs_review: ["safety_check"]` e removidos do texto visível).
- **Tratamento de Erros e Logs**:
  - Exceções do provedor e problemas de conversão JSON registram o status apropriado (`error`) na tabela `ai_usage_logs` com uso preciso de tokens.

O Frontend foi validado (`JobAiDraftPanel.test.tsx` com 49 testes passando) e mapeia os valores limpos entregues pela API, omitindo intencionalmente campos que requerem revisão humana forçada (ex: min/max salary), e mapeando todas as listas sanitizadas para a UI de aprovação de vaga.
