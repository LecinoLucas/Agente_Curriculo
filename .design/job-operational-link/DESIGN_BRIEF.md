# OP-2 - Vagas Multiunidade

Data: 2026-06-01

## Contexto

O sistema de Admissao RH hoje usa `jobs.location` como texto livre. Esse campo funciona para o fluxo corporativo atual e aparece em contratos internos, portal publico, portal do candidato, listagem de vagas, pipeline e matching. A OP-1A adicionou o Cadastro Mestre Operacional no backend com:

- `OperationalGroup`: grupo interno/Protheus.
- `LocationGroup`: localidade humana, como Peritoro, Hidrolandia ou Goiania.
- `OperationalUnit`: filial/posto real com codigo operacional.

A OP-2 deve vincular vagas a esses cadastros sem remover `jobs.location`, sem exigir dados novos para vagas existentes e sem alterar comportamento de candidato, pipeline, matching, pre-admissao, bot ou WhatsApp.

## Problema

Uma vaga pode representar cenarios diferentes:

- Vaga corporativa antiga, sem grupo/localidade/filial.
- Vaga de escritorio vinculada ao Grupo 01 e filial 0101.
- Vaga de posto vinculada ao Grupo 02 e a uma filial especifica.
- Vaga operacional tipo pool por localidade, como `Frentista - Peritoro`, vinculada a filiais 4301 e 4601.
- Futuro portal do candidato sugerindo vagas por localidade/posto.
- Futuro pipeline filtravel por grupo, localidade e filial.

Criar uma vaga duplicada para cada posto resolveria parte da filtragem, mas fragmentaria candidatos, ranking, pipeline, comunicacao e relatorios. O modelo deve permitir uma vaga unica com uma ou varias unidades operacionais.

## Objetivos

- Adicionar vinculo operacional opcional em vagas.
- Preservar compatibilidade total com vagas legadas baseadas apenas em `jobs.location`.
- Permitir filtros internos por grupo, localidade e filial.
- Permitir que RH enxergue grupo, filial e localidade sem expor codigos como informacao principal para candidatos.
- Preparar evolucao futura de portal do candidato e `CandidateApplication`, sem implementar esses fluxos agora.
- Evitar duplicacao desnecessaria de vagas por posto quando uma vaga-pool resolve o caso.

## Nao Objetivos

- Nao remover, renomear ou tornar obrigatorio `jobs.location`.
- Nao migrar automaticamente `jobs.location` para grupo/localidade/filial nesta fase.
- Nao criar dados falsos dos 51 postos.
- Nao implementar frontend nesta fase de planejamento.
- Nao alterar JobModel, Pipeline, Candidate, Candidate Portal, Matching/IA, Pre-admissao, bot ou WhatsApp neste plano.
- Nao prometer automacao de WhatsApp ou decisao automatica de contratacao/reprovacao por IA.

## Conceitos

`Grupo operacional`
: Dado interno e de integracao Protheus. Exemplo: Grupo 01 - Escritorio, Grupo 02 - Postos.

`Localidade`
: Dado humano para RH e candidato. Exemplo: Peritoro, Hidrolandia, Goiania.

`Filial/Posto`
: Unidade real de operacao com codigo. Exemplo: Grupo 02, filial 4301.

`Vaga multiunidade`
: Uma vaga unica que atende uma ou mais unidades operacionais, possivelmente agrupadas por localidade.

## Decisoes Recomendadas

1. Manter `jobs.location` como campo textual de exibicao e compatibilidade.
2. Adicionar campos operacionais opcionais em `jobs`, todos nullable.
3. Criar uma tabela de associacao `job_units` para vincular uma vaga a uma ou mais unidades.
4. Usar `allocation_mode` para explicar a semantica da vaga:
   - `single_unit`: uma filial/posto especifico.
   - `multi_unit`: varias filiais/postos selecionados.
   - `location_pool`: vaga-pool por localidade, com uma ou mais unidades associadas.
   - `corporate`: vaga corporativa/escritorio com vinculo operacional opcional.
5. Tratar `allocation_mode = null` como legado/texto livre, sem gravar valor artificial em vagas antigas.
6. Validar consistencia no service de vagas, nao no cliente.
7. Fazer substituicao transacional da lista de unidades em PATCH/PUT de vaga quando o cliente enviar o conjunto de unidades.

## Experiencia Futura de Cadastro de Vaga

A UI futura deve manter o formulario atual de vaga e adicionar uma secao opcional chamada `Vinculo operacional`.

Fluxo recomendado:

1. Usuario informa os dados atuais da vaga normalmente, inclusive `location`.
2. Usuario escolhe o modo de alocacao, se houver necessidade operacional.
3. Para `single_unit`, escolhe grupo, localidade e uma unidade.
4. Para `multi_unit`, escolhe grupo e uma lista de unidades.
5. Para `location_pool`, escolhe localidade e unidades relacionadas, quando ja conhecidas.
6. A interface pode sugerir `jobs.location` a partir da localidade, mas nao deve sobrescrever silenciosamente texto ja preenchido.
7. Para candidato, a exibicao principal continua humana: localidade, nome publico do posto e ponto de referencia quando aplicavel. Codigo de filial e grupo ficam para RH/Protheus.

## Compatibilidade Esperada

- Vagas sem novos campos continuam sendo criadas, listadas, publicadas, arquivadas e usadas no pipeline.
- Endpoints publicos continuam retornando `location`.
- Matching e ranking nao passam a depender de grupo/localidade/filial.
- Bulk import continua aceitando vagas apenas com `location`.
- Filtros novos sao adicionais e so restringem resultado quando enviados.

## Criterios de Aceite da OP-2

- Migration aditiva passa em ambiente limpo e ambiente com dados existentes.
- Vaga legada sem vinculo operacional continua funcionando.
- Vaga `single_unit` aceita uma unidade valida e rejeita unidade inexistente.
- Vaga `location_pool` aceita multiplas unidades sem duplicar vaga.
- Listagem interna de vagas filtra por grupo, localidade e filial.
- Portal publico/candidato preserva `location` como resposta compativel.
- Pipeline e matching seguem funcionando sem exigir campos operacionais.
