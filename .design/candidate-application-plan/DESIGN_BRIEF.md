# OP-5 - CandidateApplication + Preferencias

Data: 2026-06-01

## Objetivo

Planejar a camada backend de candidatura estruturada antes do portal horizontal sem login. A OP-5 deve introduzir uma entidade intermediaria entre `Candidate` e `candidate_job_pipeline`, capaz de registrar intencao, preferencias operacionais e consentimento sem empurrar o candidato cedo demais para o pipeline.

## Problema Atual

O fluxo publico atual `POST /api/v1/public/candidates/apply` cria ou atualiza candidato, cria curriculo e, quando recebe `job_id`, cria entrada ativa em `candidate_job_pipeline`. Esse comportamento funciona para candidatura direta a uma vaga, mas nao representa bem:

- lead incompleto que ainda esta escolhendo vaga;
- candidato interessado em uma localidade e qualquer filial daquela localidade;
- candidato interessado em uma funcao antes de uma vaga especifica;
- intake vindo de portal horizontal, bot futuro ou equipe interna;
- idempotencia de tentativas publicas sem login;
- consentimento LGPD por submissao.

Tambem existe uma constraint forte no pipeline: um candidato so pode ter um pipeline ativo. Portanto, `CandidateApplication` deve anteceder o pipeline e evitar conflito com essa constraint ate haver decisao explicita de vinculo.

## Resultado Esperado

OP-5 deve entregar um contrato tecnico para implementar:

- `CandidateApplicationModel`;
- `CandidateLocationPreferenceModel`;
- endpoints internos de aplicacoes;
- endpoints publicos futuros para portal web sem login;
- estado de candidatura separado do estado do pipeline;
- idempotencia controlada;
- compatibilidade com o fluxo publico atual;
- caminho seguro para vincular uma aplicacao ao pipeline em fase posterior.

## Usuarios e Consumidores

- Candidato publico no portal web horizontal sem login.
- Recrutador/RH usando endpoints internos.
- Bot futuro, apenas depois do portal web.
- Pipeline, em fase posterior, como consumidor de aplicacoes qualificadas/submetidas.

## Principios

- `CandidateApplication` antecede `candidate_job_pipeline`.
- `CandidateApplication` nao substitui `Candidate`.
- `Candidate` pode existir sem `User` e sem login.
- CPF nunca deve ser armazenado ou retornado em claro por esta camada.
- Portal sem login deve depender de OTP/validacao em fase futura; OP-5 nao implementa autenticacao.
- IA pode auxiliar triagem/analise depois, mas nao pode reprovar, contratar ou tomar decisao final.
- A candidatura atual nao deve quebrar; a migracao deve ser aditiva e gradual.

## Regra de Localidade e Filial

Para representar "qualquer posto da localidade":

- `preferred_location_group_id` preenchido;
- `preferred_unit_id = null`;
- `accepts_any_unit_in_location = true`.

Para filial especifica:

- `preferred_location_group_id` pode ser preenchido;
- `preferred_unit_id` preenchido;
- `accepts_any_unit_in_location = false`.

Se ambos `preferred_location_group_id` e `preferred_unit_id` forem informados, a unidade deve pertencer a localidade indicada. Nao inferir grupo/localidade por prefixo do codigo da filial.

## Fora de Escopo

- Implementar backend, migration, models ou rotas.
- Alterar frontend.
- Alterar pipeline.
- Alterar candidate-portal.
- Alterar bot, WhatsApp ou matching/IA.
- Criar dados falsos dos 51 postos.
- Implementar OTP.
- Implementar decisao automatica por IA.

## Sucesso da Proxima Implementacao

A proxima fase sera considerada correta se conseguir criar e consultar aplicacoes sem criar pipeline automaticamente, mantendo o fluxo publico atual funcional ate a migracao explicita do endpoint publico.
