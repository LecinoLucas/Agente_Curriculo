# PERF-FIX-PREADMISSION-1 — Next Steps

## Possivel endpoint agregado futuro

- Criar um endpoint agregado do workspace com `overview + documents + first-page events` para reduzir round-trips na abertura.
- Isso deve ser feito numa fase separada, com medicao de payload e cache.

## Possivel atualizacao por evento

- Incluir no contrato de approve/reject um `workspace_delta` ou `event_summary` para anexar historico local sem `GET /events`.
- Alternativa menor: devolver tambem `reviewed_by_name` e contadores recalculados.

## Possivel paginacao/lazy de eventos

- Carregar somente a primeira pagina sempre.
- Adiar paginas seguintes para interacao explicita.
- Se a UX evoluir para abas, carregar `events` apenas quando a aba estiver ativa.

## Possivel cache local por case_id

- Guardar `overview/documents/events` por `case_id` com invalidador por mutacao.
- Evitar refetch ao voltar para o mesmo caso no mesmo fluxo operacional.

## Proximo ganho de baixo risco

- Expandir o mesmo padrao de atualizacao local para outros handlers do workspace que ainda dependam de reload integral.
- Instrumentar call-count em ambiente dev para capturar regressao cedo.
