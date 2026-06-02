# Auditoria Visual: Portal do Candidato

Data: 2026-06-02
URL auditada: http://127.0.0.1:5174
Escopo: home de vagas, Portal 2, login, recuperar acesso, menu mobile e estado interativo inicial do assistente.

## Screenshots Capturados

- `.design/candidate-portal-audit/screenshots/audit-home-desktop-1280.png`
- `.design/candidate-portal-audit/screenshots/audit-home-tablet-768.png`
- `.design/candidate-portal-audit/screenshots/audit-home-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit-home-mobile-menu-open.png`
- `.design/candidate-portal-audit/screenshots/audit-portal2-desktop-1280.png`
- `.design/candidate-portal-audit/screenshots/audit-portal2-tablet-768.png`
- `.design/candidate-portal-audit/screenshots/audit-portal2-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit-portal2-cpf-desktop.png`
- `.design/candidate-portal-audit/screenshots/audit-portal2-cpf-mobile.png`
- `.design/candidate-portal-audit/screenshots/audit-login-desktop-1280.png`
- `.design/candidate-portal-audit/screenshots/audit-login-tablet-768.png`
- `.design/candidate-portal-audit/screenshots/audit-login-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit-recover-desktop-1280.png`
- `.design/candidate-portal-audit/screenshots/audit-recover-tablet-768.png`
- `.design/candidate-portal-audit/screenshots/audit-recover-mobile-375.png`

## Achados Prioritários

### Must Fix

1. O Portal 2 quebra a expectativa do usuário ao clicar em quick reply.

Evidência: `audit-portal2-cpf-desktop.png`, `audit-portal2-cpf-mobile.png`.

Ao clicar em "Informar CPF", o frontend envia o valor `cpf` como mensagem para o backend. O chat responde "Não consegui entender", mesmo o usuário tendo escolhido uma opção oferecida pela própria interface. Isso reduz confiança e interrompe a fluidez logo no primeiro contato.

Correção recomendada: tratar `cpf` e `whatsapp` como escolha de modo no frontend, não como mensagem final. Após o clique, atualizar placeholder e foco para "Digite seu CPF" ou "Digite seu WhatsApp com DDD", mantendo o backend apenas para o identificador real.

2. A home pública expõe vagas de QA/reprocesso como vagas reais.

Evidência: `audit-home-desktop-1280.png`, `audit-home-mobile-375.png`.

A lista mostra muitos itens como "QA Reprocess Job 1780...", que parecem registros técnicos ou dados de teste. Visualmente a página não parece curada para candidato, apesar de o layout estar estável.

Correção recomendada: filtrar no contrato público ou no backend apenas vagas publicáveis/status correto. Se esses jobs são reais no ambiente local, a nomenclatura ainda precisa ser bloqueada para publicação externa.

3. O login gera erros 403 no console.

Evidência técnica: `audit-metrics.json` nos três breakpoints de login.

Foram capturados dois erros 403 por viewport na página `/login`. A tela renderiza, mas esse ruído indica integração ou recurso externo bloqueado, provavelmente relacionado ao fluxo Google/dev auth.

Correção recomendada: identificar a chamada 403 e evitar carregar recurso não disponível no ambiente ou mostrar fallback controlado sem erro de console.

### Should Fix

1. O card do Portal 2 tem área vazia excessiva.

Evidência: `audit-portal2-desktop-1280.png`, `audit-portal2-mobile-375.png`.

O chat usa `min-h-[60vh]` e a área de mensagens fica alta demais para apenas uma pergunta inicial. Em desktop cria um bloco vazio grande; em mobile empurra o footer para baixo e deixa a interface parecer menos resolutiva.

Correção recomendada: usar altura adaptativa no início, por exemplo `min-h` menor para estados com poucas mensagens e crescimento após histórico; ou posicionar opções e input mais próximos da pergunta.

2. O menu mobile aberto ocupa fluxo vertical e empurra o conteúdo.

Evidência: `audit-home-mobile-menu-open.png`.

O menu abre como bloco no documento, deslocando o conteúdo inteiro para baixo. Funciona, mas passa sensação menos premium que um painel/dropdown sobreposto com sombra e fechamento por clique fora.

Correção recomendada: transformar o menu mobile em popover/overlay abaixo do header, com largura controlada, elevação e sem reflow da página.

3. O CTA "Área do candidato" aparece duplicado no mobile quando o menu está aberto.

Evidência: `audit-home-mobile-menu-open.png`.

Há um botão "Área do candidato" fixo no header e outro dentro do menu. Não quebra, mas aumenta redundância e reduz clareza.

Correção recomendada: no menu mobile, remover o CTA duplicado quando ele já estiver visível no header; ou trocar o botão do header por ícone/user shortcut em telas pequenas.

4. A home mobile fica longa demais antes de qualquer agrupamento.

Evidência: `audit-home-mobile-375.png`.

Os cards são legíveis e alinhados, mas a sequência de 23 vagas em coluna única sem paginação, destaque ou agrupamento torna a página cansativa. O footer só aparece após rolagem extensa.

Correção recomendada: limitar a primeira carga, adicionar paginação/"carregar mais", ou agrupar vagas por localidade/area com filtros compactos persistentes.

### Could Improve

1. A área de login desktop está visualmente boa, mas muito alta.

Evidência: `audit-login-desktop-1280.png`.

O bloco ilustrativo à esquerda é refinado, mas cria altura total maior que o necessário e empurra o footer para baixo. Não é erro, mas reduz densidade.

Correção recomendada: reduzir altura mínima do painel visual ou alinhar o bloco de login para ocupar menos área vertical em desktop.

2. Recuperação de acesso tem espaço vazio excessivo no desktop.

Evidência: `audit-recover-desktop-1280.png`.

O card direito tem muito espaço em branco abaixo do formulário. A página parece inacabada quando comparada ao login.

Correção recomendada: reduzir altura do container nessa rota ou adicionar estado/ajuda contextual curto no mesmo padrão visual.

3. A navegação desktop é limpa, mas o header poderia indicar melhor a seção ativa.

Evidência: `audit-home-desktop-1280.png`, `audit-portal2-desktop-1280.png`.

A página de vagas marca "Vagas", mas o Portal 2 não tem item próprio na navegação. Isso é aceitável por ser CTA, mas o usuário perde um pouco de orientação.

Correção recomendada: manter o estado no subtitulo do Portal 2, ou adicionar breadcrumb discreto "Vagas / Assistente".

## O Que Passou

- Não foi detectado overflow horizontal em desktop, tablet ou mobile.
- Campos principais estão alinhados e com altura de toque adequada.
- Tipografia está consistente e a fonte carrega corretamente.
- O tema Marajó vermelho/branco/cinza está coeso.
- Login e recuperar acesso têm hierarquia clara e bons labels visuais.
- O footer responde bem no mobile, com colunas reorganizadas sem sobreposição.
- O menu mobile abre e fecha, com botão acessível via `aria-label="Menu"`.

## Recomendações De Execução

1. Corrigir primeiro o comportamento do quick reply no Portal 2, porque é o maior problema de fluidez.
2. Remover/filtrar vagas QA da listagem pública antes de qualquer polimento visual.
3. Investigar os 403 do login e registrar fallback sem erro de console.
4. Ajustar altura adaptativa do chat e do card de recuperação.
5. Refinar o menu mobile para overlay e remover duplicidade do CTA.

## Follow-up OP-6D.1

Data: 2026-06-02

Correções aplicadas no `candidate-portal/`:

- Portal 2: os quick replies iniciais "Informar CPF" e "Informar WhatsApp" agora entram em modo guiado local e não enviam `cpf` ou `whatsapp` como mensagem para o backend.
- Portal 2: após escolher CPF/WhatsApp, o input muda para "Digite seu CPF" ou "Digite seu WhatsApp com DDD" e só envia quando o candidato digita o identificador real.
- Portal 2: quick replies de outros estados continuam sendo enviados ao backend como `quick_reply`.
- Portal 2: a superfície do chat ficou adaptativa, reduzindo a área vazia antes das ações.
- Login: o botão Google não é carregado em dev quando o portal abre em `127.0.0.1`, evitando o 403 do Google Identity Services por origem não autorizada. Em `localhost` e produção o fluxo permanece disponível quando há client ID.
- Menu mobile: passou a abrir como painel sobreposto e removeu a duplicidade do CTA "Área do candidato".

Screenshots atualizados:

- `.design/candidate-portal-audit/screenshots/op6d1-final-portal2-desktop.png`
- `.design/candidate-portal-audit/screenshots/op6d1-final-portal2-mobile.png`
- `.design/candidate-portal-audit/screenshots/op6d1-final-portal2-cpf-mobile.png`
- `.design/candidate-portal-audit/screenshots/op6d1-final-home-mobile-menu-open.png`
- `.design/candidate-portal-audit/screenshots/op6d1-final-login-127-mobile.png`
- `.design/candidate-portal-audit/screenshots/op6d1-final-smoke-metrics.json`

Validação OP-6D.1:

- `npm test`: 61 testes passaram.
- `npm --prefix candidate-portal run build`: passou.
- Smoke visual Playwright desktop/mobile: sem erros de console nos estados capturados.

Pendente:

- As vagas "QA Reprocess Job..." continuam aparecendo porque a API pública já retorna apenas vagas `published`; no ambiente local esses registros estão publicados. Filtrar por string no frontend mascararia dado interno publicado. A correção adequada é saneamento/publicação no dado ou regra backend/admin de visibilidade, fora do escopo OP-6D.1.

## Nova Auditoria Pos-Correcoes

Data: 2026-06-02
URL auditada: `http://localhost:5174` e `http://127.0.0.1:5174/login`

Screenshots capturados:

- `.design/candidate-portal-audit/screenshots/audit2-home-desktop-1280.png`
- `.design/candidate-portal-audit/screenshots/audit2-home-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit2-home-mobile-menu-open.png`
- `.design/candidate-portal-audit/screenshots/audit2-portal2-desktop-1280.png`
- `.design/candidate-portal-audit/screenshots/audit2-portal2-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit2-portal2-cpf-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit2-portal2-whatsapp-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit2-login-localhost-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit2-login-127-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit2-recover-mobile-375.png`
- `.design/candidate-portal-audit/screenshots/audit2-metrics.json`

### Resultado

Os principais problemas de UX da OP-6D.1 foram resolvidos visualmente:

- Portal 2: clicar em "Informar CPF" agora mostra a instrucao "Digite seu CPF no campo abaixo para continuar" e placeholder "Digite seu CPF"; nao ha resposta de erro nem envio de `cpf` cru.
- Portal 2: clicar em "Informar WhatsApp" mostra a instrucao e placeholder corretos para telefone com DDD.
- Portal 2: o card ficou mais compacto. A altura mobile caiu de aproximadamente `1301px` na auditoria anterior para `1206px` no estado inicial e `1125px` nos estados CPF/WhatsApp.
- Login em `127.0.0.1`: nao houve erro 403 de Google Identity Services nos screenshots atuais.
- Menu mobile: abre como painel sobreposto, nao empurra a pagina e mantem apenas um CTA "Area do candidato".
- Todos os screenshots auditados ficaram sem overflow horizontal.
- Todos os estados capturados ficaram sem erros de console ou responses 4xx/5xx no smoke Playwright.

### Pendencias

1. Vagas tecnicas continuam aparecendo na home publica.

Evidencia: `audit2-home-desktop-1280.png`, `audit2-home-mobile-375.png`, `audit2-metrics.json`.

A pagina ainda mostra `QA Analise Job...` e muitos `QA Reprocess Job...`. Como a home consome `/api/v1/public/jobs`, e o contrato backend desse endpoint ja e de vagas publicadas, isso indica dado local publicado indevidamente ou falta de criterio de publicacao/visibilidade no backend/admin. Nao recomendo filtrar por string no frontend.

2. Home mobile segue longa demais.

Evidencia: `audit2-home-mobile-375.png`.

Sem overflow, mas `bodyHeight` ficou em `6494px` com 23 vagas. Para candidato, o primeiro acesso fica cansativo. A solucao recomendada e paginacao, "carregar mais" ou agrupamento por area/localidade.

3. Recuperacao de acesso esta funcional, mas ainda simples.

Evidencia: `audit2-recover-mobile-375.png`.

Nao ha erro visual ou campo torto. Ainda pode ganhar uma mensagem curta de expectativa, por exemplo prazo/canal das instrucoes, mas isso e polimento.

### Veredito

O Portal 2 ficou apto para smoke visual inicial: fluxo de identificacao esta compreensivel para candidato leigo, sem erro no primeiro clique, sem console sujo e sem quebra responsiva. A maior pendencia atual do portal e governanca de dados publicados na home de vagas, nao layout.

---

## OP-6D.2 — UX de OTP e reinicio de conversa (Portal 2)

Data: 2026-06-02. Escopo: apenas `candidate-portal/`. Sem alterar backend.

### O que mudou (`CandidatePortal2Page.tsx`)

1. **Reiniciar conversa sempre acessivel.** Botao "Começar nova conversa" (ghost,
   icone `RotateCcw`) no cabecalho enquanto a sessao esta carregada. Limpa o
   `session_id` do localStorage + historico local e cria nova sessao via
   `POST /conversations`, voltando ao estado inicial. O reload **continua**
   retomando a sessao (so o clique manual zera o storage).
2. **Feedback de retomada.** Ao reabrir uma sessao existente, mostra um aviso
   discreto "Continuamos de onde você parou."; a acao de recomecar fica ao lado,
   no cabecalho.
3. **VERIFY_OTP amigavel para leigo.** Acoes rapidas: "Digitar código", "Não recebi
   o código", "Trocar CPF/WhatsApp", "Começar de novo". "Não recebi o código" mostra
   ajuda local ("Sem problema. Você pode conferir o CPF/WhatsApp informado ou começar
   de novo.") com "Tentar digitar o código" / "Trocar CPF/WhatsApp" / "Começar de
   novo" — **sem** enviar nada ao backend.
4. **Campo de codigo correto.** Em OTP: placeholder "Digite o código de 6 dígitos",
   `inputMode=numeric`, `maxLength=6`, filtragem de nao-digitos, e envio so habilita
   com 6 digitos. Texto invalido ("nao tenho", "nao recebi", letras) nunca vai ao
   backend como OTP.

### Self design-review (heuristica, sem screenshots novos)

- **Clareza para leigo:** acoes em portugues simples, botoes grandes (`size=lg`,
  `fullWidth`), hierarquia outline > secondary > ghost separando "tentar" de
  "recomecar". OK.
- **Reversibilidade/controle:** usuario nunca fica preso no OTP; sempre ha saida
  (ajuda, trocar identificador, recomecar). OK.
- **Consistencia visual:** reusa `Button` e tokens existentes; nenhum estilo novo
  fora do design system; sem overflow esperado (botoes empilhados). OK.
- **Acessibilidade:** botao de reinicio com `aria-label`; input com `aria-label`
  preservado; `aria-live=polite` no fluxo de mensagens. OK.

### Pendencia / smoke visual

Screenshots ao vivo nao foram capturados nesta fase: exigem backend rodando e um
identificador que leve a engine ao estado `VERIFY_OTP` (sem envio real de OTP em
dev). Cobertura garantida por testes de unidade (vitest) do Portal 2. Recomendado
capturar `portal2-otp-actions` e `portal2-otp-help` num smoke Playwright quando o
backend de dev estiver disponivel.
