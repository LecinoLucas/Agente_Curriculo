# JOB-AI-FIX-2B - Alinhamento do AI Draft ao formulário

## Campos adicionados ao AI Draft

- `experience_context`
- `minimum_education_level`
- `minimum_years_experience`

Os campos foram adicionados ao contrato de resposta do AI Draft, ao parser backend, ao prompt de geração e ao mapeamento do router. Não houve migration, endpoint novo ou alteração da entidade principal `Job`.

## Aplicação no formulário

O frontend aplica os novos campos em `applyApiDraftToForm`:

- `experience_context` -> campo "Contexto de experiência"
- `minimum_education_level` -> campo "Escolaridade mínima"
- `minimum_years_experience` -> campo "Anos mínimos de experiência"

Valores `null`, `undefined` ou string vazia são omitidos do objeto de updates. Isso preserva o comportamento seguro: o rascunho não apaga campos já preenchidos quando o backend não retorna evidência suficiente.

## Decisões de contrato

- `minimum_education_level` retorna os valores normalizados já usados pelo formulário: `none`, `high_school`, `technical`, `bachelor`, `postgraduate`, `master`, `phd`.
- `minimum_years_experience` retorna número em anos.
- Menções em meses são convertidas para anos decimais. Exemplo: `6 meses` -> `0.5`, compatível com o input do formulário (`step=0.5`).
- `experience_context` é texto curto derivado de evidência explícita de experiência, vivência ou conhecimento no texto de origem.
- Warnings seguem como lista de strings, mantendo contrato estável para o frontend.

## Limitações restantes

- Abreviações e variações muito livres podem ser ignoradas para evitar preenchimento inventado.
- O contexto de experiência é conservador: quando a IA retorna um contexto não comprovado, o backend reduz para o trecho explícito encontrado ou limpa o campo.
- A exibição de escolaridade no preview usa o valor técnico normalizado; labels amigáveis podem ser refinadas em fase visual futura.
