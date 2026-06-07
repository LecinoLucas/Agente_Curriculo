# JOB-AI-FIX-2A - Guardrails de salário e benefícios

## O que foi alterado

- Reforçada a validação backend do Job AI Draft em `job_ai_draft_rules.py`.
- Adicionadas funções puras para detectar evidência explícita de salário e benefício por item.
- Salário retornado pela IA agora é removido quando o texto de origem não contém evidência salarial explícita.
- Benefícios retornados pela IA agora são filtrados individualmente; cada item precisa existir explicitamente no texto de origem.
- `missing_benefits` foi removido do cálculo de qualidade para não incentivar benefício inventado.
- Testes unitários backend foram ampliados para cobrir salário, benefícios, qualidade, regressões de segurança e fluxo LangGraph.

## Regras de evidência

### Salário

O backend preserva `salary_min` e `salary_max` somente quando o texto original contém pelo menos uma evidência explícita:

- `salário` ou `salario`
- `faixa salarial`
- `remuneração` ou `remuneracao`
- `R$`
- `BRL`
- `mensal`
- `por mês`
- `ao mês`

Números isolados não são evidência salarial. Exemplos como `6x1`, `44h semanais`, `2 anos de experiência`, `3 vagas`, `turno de 8 horas` e `loja 24h` não preservam salário.

### Benefícios

Cada benefício precisa ter correspondência textual explícita no input após normalização conservadora de acentos, caixa e pontuação.

Exemplos:

- Input `vale transporte` preserva `Vale-transporte`.
- Input `plano de saúde` preserva `Plano de saúde`.
- Input apenas `vaga para vendedor` remove `Vale-transporte`, `Plano de saúde`, `Bônus` e outros benefícios sugeridos.
- Se o input cita `vale transporte` e a IA retorna `Vale-transporte` mais `Plano de saúde`, somente `Vale-transporte` é preservado.

## Warnings

Warnings novos e testáveis:

- `salary_removed_no_source_evidence`
- `benefit_removed_no_source_evidence`

Os warnings são strings simples e não incluem prompt bruto, resposta bruta ou dados sensíveis.

## Decisões

- A barreira principal fica no backend, cobrindo o fluxo procedural e o fluxo LangGraph porque ambos usam `post_validate`.
- Não houve alteração de endpoint público, schema de resposta, frontend, formulário ou migration.
- A ausência de benefícios deixou de afetar o quality score; não foi adicionado warning neutro nesta fase para evitar ruído extra no contrato do frontend.
- A regra de benefícios é propositalmente conservadora: não expande sinônimos amplos para evitar preservar benefício não comprovado.

## Riscos restantes

- Benefícios escritos com abreviações não equivalentes ao texto da IA, como `VT` versus `Vale-transporte`, podem ser removidos mesmo quando o humano pretendia informá-los.
- A palavra `mensal` é aceita como evidência salarial conforme regra da fase, mas pode ser ambígua em textos raros.
- Campos comerciais sensíveis além de salário e benefícios devem continuar sendo tratados em fases específicas se forem identificados.
