# JOB-AI-FIX-2B - Regras de experiência e educação

## `minimum_years_experience`

Preservar somente com evidência explícita de tempo de experiência.

Exemplos aceitos:

- `2 anos de experiência` -> `2`
- `mínimo 1 ano` -> `1`
- `experiência mínima de 6 meses` -> `0.5`
- `pelo menos 3 anos` -> `3`
- `1+ ano de experiência` -> `1`
- `mais de 2 anos de experiência` -> `2`

Exemplos rejeitados:

- `júnior`
- `pleno`
- `sênior`
- `experiente`
- `vivência`
- `conhecimento`
- `escala 6x1`
- `44h`
- `3 vagas`
- números soltos sem relação com experiência

Warning usado quando removido:

- `minimum_years_experience_removed_no_source_evidence`

## `minimum_education_level`

Preservar somente com termo explícito de escolaridade.

Exemplos aceitos:

- `ensino fundamental` -> `none`
- `ensino médio` ou `ensino médio completo` -> `high_school`
- `técnico` ou `curso técnico` -> `technical`
- `superior`, `superior completo` ou `graduação` -> `bachelor`
- `pós-graduação` ou `MBA` -> `postgraduate`
- `mestrado` -> `master`
- `doutorado` ou `PhD` -> `phd`

Exemplos rejeitados:

- cargo administrativo -> não infere ensino médio
- cargo analista -> não infere superior
- cargo gerente -> não infere superior
- `boa comunicação`
- `conhecimento em Excel`

Warning usado quando removido:

- `minimum_education_level_removed_no_source_evidence`

## `experience_context`

Pode ser preservado quando deriva de evidência explícita no texto.

Exemplos aceitos:

- `experiência com atendimento ao cliente`
- `vivência com vendas externas`
- `experiência em rotinas administrativas`
- `conhecimento em Protheus`
- `experiência com conciliação financeira`

Exemplos rejeitados:

- ferramentas não citadas
- setores não citados
- senioridade não citada
- anos não citados

Quando o contexto retornado pela IA não bate com a evidência, o backend reduz para o contexto explícito encontrado. Se não houver evidência de contexto, limpa o campo e usa:

- `experience_context_removed_no_source_evidence`
