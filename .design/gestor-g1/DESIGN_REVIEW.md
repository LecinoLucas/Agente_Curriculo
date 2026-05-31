# Design Review: Gestor G1

Status: aprovado

## Must-fix

Nenhum must-fix restante.

## Should-fix

Nenhum should-fix restante para esta fase.

## Could-improve

- Em uma fase futura, diferenciar visualmente "atribuido por scorecard" e "atribuido por solicitacao de revisao" se isso virar uma necessidade operacional.
- Quando existir departamento/unidade/responsavel da vaga, revisar novamente a copia para evitar ambiguidade entre escopo organizacional e atribuicao pontual.

## Revisao

- Lista vazia autorizada nao vira mais 403.
- 403 ficou reservado para falta real de acesso.
- `candidate_count` agora comunica candidatos atribuidos/visiveis ao gestor.
- Candidato ativo na mesma vaga, mas sem atribuicao ao gestor, nao aparece na lista.
- Mensagens criticas do backend foram localizadas para portugues.
- `ManagerReviewPage` deixou de engolir falhas de resumo seguro e scorecard.
- Estado vazio em candidatos ficou especifico: `Nenhum candidato atribuido nesta vaga`.
- Nao houve redesign amplo; apenas polimento textual/estado e contador.

## Validacao Visual

Revisao manual autenticada com Playwright, usando endpoints do gestor mockados para cobrir solicitacao, candidato e vazio:

- Header e abas seguem inalterados.
- Contador da vaga ficou menos enganoso, sem sugerir total bruto da vaga.
- Erros aparecem proximos ao painel afetado, sem bloquear toda a pagina indevidamente.
- Estado vazio esta claro e nao parece falha de permissao.
- Desktop aproveita bem a largura em tres colunas no modo Candidatos.
- Mobile empilha vagas, candidatos e resumo sem sobreposicao com o menu fechado.

Screenshots:

- `.design/gestor-g1/screenshots/manager-review-desktop-requests.png`
- `.design/gestor-g1/screenshots/manager-review-desktop-candidate.png`
- `.design/gestor-g1/screenshots/manager-review-desktop-empty.png`
- `.design/gestor-g1/screenshots/manager-review-mobile-empty.png`
