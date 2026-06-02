# OP-5 - Risks and Guards

Data: 2026-06-01

## Riscos Principais

### Duplicar candidatura ativa

Risco: retries, portal sem login ou bot futuro criarem varias aplicacoes equivalentes.

Guardas:

- `source + idempotency_key`;
- regra de aplicacao ativa equivalente;
- testes de concorrencia/idempotencia;
- resposta generica quando houver risco de enumeracao publica.

### Misturar lead incompleto com candidato real

Risco: criar `Candidate` cedo demais com dados incompletos e poluir base.

Guardas:

- definir dados minimos por estado;
- manter `started` separado de `submitted`;
- considerar intake temporario em fase futura se o produto quiser salvar antes de identificar candidato;
- nao mover para pipeline sem `submitted`.

### Quebrar fluxo publico atual

Risco: trocar `/public/candidates/apply` para novo fluxo e interromper candidatura existente.

Guardas:

- manter rota atual inicialmente;
- criar novo endpoint publico em paralelo;
- testes de regressao obrigatorios do fluxo atual;
- feature flag ou rollout controlado.

### Ferir LGPD

Risco: CPF em claro, consentimento ausente, exposicao de dados internos em response publico.

Guardas:

- CPF apenas via camada existente de candidato com hash/last4;
- `CandidateApplication` nao guarda CPF;
- `lgpd_consent_at` e `lgpd_consent_version` obrigatorios para `submitted`;
- responses publicos sem `cpf`, `cpf_hash`, `idempotency_key`, `metadata`;
- logs sem CPF.

### Jogar candidato no pipeline cedo demais

Risco: `CandidateApplication` virar pipeline automaticamente e bloquear outros processos pela constraint ativa.

Guardas:

- nenhum create/patch de aplicacao cria pipeline;
- endpoint futuro dedicado `link-to-pipeline`;
- checagem explicita da constraint de pipeline ativo;
- decisao humana para vinculo.

### Conflito com constraint de pipeline ativo

Risco: candidato interessado em varias vagas/localidades, mas pipeline permite uma ativa.

Guardas:

- permitir varias aplicacoes historicas/ativas conforme regra de produto;
- manter apenas um pipeline ativo;
- ao vincular, retornar conflito ou exigir transferencia;
- nao usar `CandidateApplication` para burlar a constraint do pipeline.

### Frontend/bot criarem estado impossivel

Risco: `accepts_any_unit_in_location=true` com filial especifica, ou aplicacao `submitted` sem consentimento.

Guardas:

- checks no banco;
- validacao no service;
- contrato de API com erros previsiveis;
- testes de schema e service.

### Preferencias inconsistentes com vagas multiunidade

Risco: candidato escolhe filial/localidade que nao combina com a vaga ou com `job_units`.

Guardas:

- se `job_id` e `preferred_unit_id` forem informados, verificar se a unidade esta em `job_units` ativos da vaga quando a vaga tiver unidades.
- se `job_id` e `preferred_location_group_id` forem informados, verificar consistencia com `jobs.location_group_id` ou com unidades ativas da vaga.
- se a vaga nao tiver estrutura operacional, aceitar preferencia como desejo do candidato, nao como garantia de alocacao.

### IA como decisora final

Risco: usar analise IA para reprovar, contratar ou mover estado terminal.

Guardas:

- IA nao altera `status` para terminal;
- IA nao cria pipeline;
- IA nao move candidato;
- decisions finais continuam humanas e auditaveis.

## Regression-Risk Review

Areas sensiveis para testes antes de merge da implementacao:

- `POST /api/v1/public/candidates/apply` atual.
- Criacao de candidato publico sem `created_by`.
- Upload de curriculo publico.
- Duplicidade CPF/email atual.
- `candidate_job_pipeline` constraint de uma ativa por candidato.
- Vagas multiunidade e consistencia de localidade/filial.
- Candidate portal login/sessao, para confirmar que candidato sem `User` continua valido.

## Guardas de Git e Escopo

Na implementacao:

- nao alterar frontend junto com migration backend;
- nao alterar bot/WhatsApp;
- nao alterar matching/IA;
- nao alterar pre-admissao;
- commits separados por migration/model, service/API e testes;
- revisar `git diff --name-only` antes do final.
