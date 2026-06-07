# ADMIN UI Framework

Data: 2026-06-07
Escopo: contrato visual oficial para telas administrativas densas.

## Filosofia visual

Telas administrativas do Admissão RH devem priorizar leitura rápida, operação segura e densidade controlada.

A interface não deve parecer dashboard promocional, nem formulário bruto aberto o tempo todo. O padrão oficial é:

- Lista primeiro.
- Detalhe sob demanda.
- Formulário só abre por ação explícita.
- Card resume, não edita.
- Chunk, log ou documento longo nunca fica aberto por padrão.

## Regra principal

Toda tela administrativa deve começar no estado mais compacto e operacional possível.

Isso significa:

- a primeira visão deve favorecer tabela, lista ou resumo enxuto;
- detalhes extensos devem ficar escondidos até o usuário pedir;
- criação e edição não devem ocupar a tela principal antes de uma ação explícita;
- a hierarquia visual deve mostrar primeiro o que precisa de atenção agora.

## Estrutura recomendada da tela

### 1. Header compacto

O topo da tela deve conter:

- label/eyebrow curto;
- título;
- descrição curta;
- ações à direita.

Regras:

- sem hero grande;
- sem muito espaço vertical;
- sem blocos decorativos competindo com a lista principal.

### 2. Métrica compacta

Métricas operacionais devem aparecer em faixa curta e densa.

Usar para:

- total;
- publicados;
- pendentes;
- erros;
- última atualização.

Não usar:

- cards altos com muita descrição;
- KPIs que roubam o foco da tabela principal;
- grids grandes quando bastaria uma strip compacta.

### 3. Toolbar com busca e filtro

Toda tela densa deve prever uma área curta para:

- busca;
- filtros;
- ordenação;
- ações secundárias.

Regras:

- toolbar acima da lista;
- busca e filtro visíveis sem empurrar o conteúdo para baixo demais;
- ações secundárias agrupadas, não misturadas ao CTA principal.

### 4. Lista ou tabela principal

Este é o centro da tela.

Usar tabela/lista quando:

- o usuário precisa comparar vários itens;
- a tela é de administração, governança, revisão, catálogo ou monitoramento;
- o conteúdo principal é relacional e repetitivo;
- ações por linha fazem mais sentido do que detalhes já expandidos.

Cada linha deve mostrar:

- identificação do item;
- status resumido;
- metadados essenciais;
- ações compactas.

Não renderizar por padrão:

- conteúdo longo;
- chunks completos;
- logs completos;
- documentos extensos;
- formulários inline expansivos.

## Quando usar tabela

Use tabela quando houver:

- múltiplos registros comparáveis;
- colunas relativamente estáveis;
- ações repetidas por item;
- necessidade de ordenação, busca, filtro ou revisão.

Exemplos:

- documentos da base de conhecimento;
- templates de checklist;
- logs administrativos;
- filas, eventos, auditoria, catálogos.

## Quando usar card

Use card apenas para:

- resumo curto;
- agrupamento enxuto;
- métrica compacta;
- estado vazio;
- bloco de apoio com informação limitada.

Card não deve:

- virar editor principal;
- conter formulário inteiro aberto por padrão;
- disputar atenção com vários outros cards equivalentes;
- substituir tabela quando o usuário precisa comparar itens.

## Quando usar modal

Use modal quando:

- a ação é focada e pontual;
- o usuário precisa criar, editar, confirmar ou revisar um único item;
- a interação tem começo, meio e fim curtos;
- a tela principal deve continuar intacta por baixo.

Ideal para:

- criação rápida;
- confirmação destrutiva;
- revisão de detalhes curtos;
- edição com contexto limitado.

## Quando usar drawer ou side panel

Use drawer/side panel quando:

- o detalhe precisa de mais espaço do que um modal curto;
- o usuário precisa manter referência visual da lista principal;
- edição ou inspeção é contextual a uma linha da tabela.

Ideal para:

- editar item;
- ver detalhes;
- inspecionar chunks, logs, histórico, metadados ou documento resumido.

Drawer não deve ser usado para:

- navegação principal;
- abrir a tela já em estado expandido;
- substituir a própria list page.

## Quando usar accordion

Use accordion apenas dentro de contextos secundários, como:

- painel de detalhes;
- histórico;
- ajuda contextual;
- agrupamentos opcionais.

Não usar accordion como estrutura principal da página quando isso esconder a lista principal ou transformar revisão em caça ao conteúdo.

## Como tratar formulário

Regras oficiais:

- formulário não abre por padrão;
- formulário só aparece após ação explícita;
- criação e edição preferem modal ou drawer;
- a página principal continua dedicada à lista.

Evitar:

- editor aberto abaixo da toolbar sem o usuário pedir;
- formulário vazio ocupando espaço;
- vários formulários ao mesmo tempo na mesma tela;
- mistura de listagem e edição extensa no mesmo bloco primário.

## Como tratar chunk, log e documento longo

Nunca abrir por padrão:

- chunks;
- logs;
- JSONs;
- documentos longos;
- histórico operacional extenso.

Mostrar na lista apenas:

- preview curto;
- contagem;
- último status;
- data;
- ação “ver detalhes”.

Abrir o conteúdo completo apenas em:

- painel lateral;
- modal;
- área de detalhe sob demanda.

## Regras de botões

Cada seção deve ter apenas um botão primário visualmente dominante.

Regras:

- ação principal: sólida e única;
- ações secundárias: outline ou estilo neutro;
- ações destrutivas: discretas, com tom de perigo moderado;
- ação destrutiva sempre com confirmação antes do efeito final.

Evitar:

- vários botões sólidos lado a lado;
- vermelho para tudo que é “obrigatório” ou “importante”;
- ações principais e secundárias sem distinção visual;
- CTA destrutivo com mais destaque que a ação operacional principal.

## Estados vazios

Toda tela administrativa deve ter estado vazio útil.

O empty state deve explicar:

- o que não existe ainda;
- o que o usuário pode fazer agora;
- qual é a próxima ação recomendada.

Evitar:

- texto genérico demais;
- ícone grande sem instrução;
- estado vazio com muito espaço e pouca direção.

## Loading e erro

Loading:

- deve indicar claramente que a lista principal está carregando;
- preferir skeleton ou mensagem enxuta;
- não simular formulário ou cards falsos demais.

Erro:

- mensagem curta e amigável;
- explicar o que falhou;
- incluir ação de retry quando aplicável.

Evitar:

- erro técnico cru;
- stack trace;
- JSON interno;
- silêncio total.

## Dados sensíveis

Dados sensíveis nunca devem ser expostos na tela principal nem em previews resumidos.

Ocultar ou sanitizar:

- CPF;
- telefone;
- e-mail real;
- payload interno;
- vetores;
- embeddings;
- hashes;
- notas internas sensíveis;
- segredos operacionais.

Se houver detalhe sensível administrativamente necessário, ele deve passar por fluxo explícito e nunca aparecer aberto por padrão.

## Exemplos bons e ruins

### Bom

- página abre com tabela de documentos;
- topo tem título, descrição curta e um CTA principal;
- métricas aparecem em strip compacta;
- ações por linha ficam em menu compacto;
- editar abre side panel;
- chunks só aparecem ao clicar em “ver detalhes”.

### Ruim

- página abre com formulário vazio enorme;
- lista é substituída por vários cards altos;
- documento inteiro aparece expandido na própria tela;
- três botões primários competem no topo;
- botão vermelho aparece em itens não destrutivos;
- cada seção abre conteúdo longo por padrão.

## Regra final para revisão

Se a tela parecer mais um painel de operação do que um conjunto de blocos pesados, ela tende a estar certa.

Se parecer uma mistura de dashboard, formulário aberto e detalhe expandido, ela está fora do padrão.
