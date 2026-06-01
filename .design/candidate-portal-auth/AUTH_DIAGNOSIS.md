# CP-Auth-Audit-1 — Diagnóstico definitivo do login do candidate-portal

> Auditoria **somente leitura**. Nenhum código foi alterado.
> Data: 2026-05-31 · Modelo: Claude Opus.

---

## 1. Resumo executivo

O backend de autenticação do candidato está **logicamente correto**. Em **todos** os
fluxos de login bem-sucedidos (e-mail/senha **e** Google, incluindo `needs_completion`)
a sessão é criada e o cookie `candidate_portal_token` é emitido. Os endpoints `/me` e
`/me/applications` exigem **apenas** um cookie de sessão válido — não exigem perfil
completo. Portanto, **se `/me` retorna 401 logo após um login bem-sucedido, a causa é
que o cookie não está chegando ao backend** — não é falha de lógica de sessão.

**Causa raiz mais provável:** *cross-site cookie blocking* por **divergência de host**
entre o frontend e a API. O cookie é `SameSite=Lax`. Quando a página é aberta em um host
diferente do host da API (ex.: página em `192.168.1.88:5174` chamando API em
`localhost:8000`, ou `localhost` vs `127.0.0.1`), o navegador **define** o cookie mas
**não o reenvia** num `fetch()`/XHR cross-site — apenas em navegação top-level GET. Isso
gera exatamente o sintoma "Google tokeninfo 200, mas `/me` 401".

**Causa secundária:** 19 de 32 candidatos ativos **não têm `password_hash`**. Esses
candidatos não conseguem login por e-mail/senha (precisam do fluxo *Recuperar/criar
senha*). Como o 401 de "senha errada" e o de "sem senha definida" são **indistinguíveis**
(decisão de segurança correta), esses usuários parecem "não conseguir logar".

O fluxo de candidatura pública **persiste** `password_hash` para candidatos novos
(`public_application_service.py:280`), então um candidato recém-criado pelo formulário
atual consegue logar — desde que o host esteja alinhado.

---

## 2. Fluxo e-mail/senha atual

Passo a passo:

1. Frontend: `candidateAuthService.login(email, password)` →
   `publicApiClient.post('/auth/login', {email, password})` com `credentials: 'include'`.
   Base: `VITE_PUBLIC_API_BASE_URL` (`http://localhost:8000/api/v1/public`).
2. Endpoint: `POST /api/v1/public/auth/login` → `auth_login`
   (`public_candidate_portal.py:178`).
3. `CandidatePortalAuthService.login` (`candidate_portal_auth_service.py:69`):
   - normaliza e-mail; se vazio/senha vazia → `InvalidCredentials` → **401**;
   - checa lockout no Redis (5 tentativas / 15 min) → `Locked` → **429**;
   - busca candidato por e-mail (não deletado/arquivado); se `None` → **401**;
   - se `password_hash` ausente **ou** `verify_password` falha → registra tentativa →
     **401** (`:101-104`);
   - sucesso → `create_session`.
4. `create_session` (`:120`): gera `secrets.token_urlsafe(32)`, grava `sha256(token)` em
   `candidate_auth_tokens` (`purpose=portal_session`, TTL 24h).
5. Router faz `response.set_cookie(candidate_portal_token, …)` (`:193-201`) e
   `db.commit()`.
6. Resposta **200** com `redirect_to="/candidato/portal"` (o frontend **ignora** esse
   campo e navega para `/minha-area`).
7. `CandidateHomePage` chama `/me` e `/me/applications` em paralelo.

**Respostas exigidas:**

- **Candidato novo COM senha deveria logar?** Sim. O apply seta `password_hash`
  (`public_application_service.py:280`).
- **Em qual condição retorna 401?** candidato inexistente; `password_hash` nulo; senha
  errada; ou cookie ausente/inválido em `/me`.
- **Erro de senha e ausência de `password_hash` são indistinguíveis?** **Sim**, ambos
  retornam `"E-mail ou senha inválidos."` 401 (anti-enumeração — correto em segurança,
  porém esconde do candidato sem senha que ele precisa do fluxo de recuperação).
- **Cookie é criado em todo login bem-sucedido?** **Sim**, sempre.

---

## 3. Fluxo Google atual

1. GSI renderiza o botão (gated por `VITE_GOOGLE_CLIENT_ID`); no callback envia
   `id_token` → `candidateAuthService.loginWithGoogle` →
   `POST /api/v1/public/auth/google`.
2. `auth_google` (`public_candidate_portal.py:134`) → `CandidateGoogleAuthService.authenticate`.
3. `verifier.verify(id_token)`; se `!email_verified` → 401.
4. `_find_or_create_candidate` por `google_sub` ou e-mail (trata conflitos → 409).
5. `completion_state` é calculado.
6. **`create_session` é chamado SEMPRE** (`candidate_google_auth_service.py:59`),
   inclusive quando há `missing_fields`.
7. `status = "authenticated"` se sem `missing_fields`, senão `"needs_completion"`.
8. Router seta o cookie `candidate_portal_token` (`:148-156`) e `db.commit()`.
9. Frontend: `authenticated` → `/minha-area`; `needs_completion` → `/completar-cadastro`
   (`CandidateLoginPage.tsx`). `GoogleCompletionPage` oferece "Ir para minha área".

**Respostas exigidas:**

- **Google autenticado cria `candidate_portal_token`?** Sim.
- **`needs_completion` cria sessão?** **Sim** — `create_session` roda independentemente
  do estado de completude.
- **Se cria sessão, `/me` deveria funcionar?** **Sim.** `/me` usa
  `CurrentCandidateSession` (básico) e só exige cookie válido; retorna 200 mesmo com
  perfil incompleto (`get_me` só falha se o candidato não existir).
- **Se cria sessão, por que oferecer "Ir para minha área"?** É **legítimo**: a sessão
  existe e `/me` funciona. Não é enganoso. (O bloqueio por perfil incompleto só ocorre em
  endpoints `CurrentCompleteCandidateSession`, ex.: pré-admissão — não em `/me`.)
- **Existe confusão com auth staff?** **Não no código.** Staff usa Bearer/JWT
  (`get_current_user`, `Authorization` header); candidato usa Cookie
  (`get_current_candidate_session`, alias `candidate_portal_token`). Separação limpa.
- **Logs `user.login`/`user.logout` são de staff ou candidate?** **Staff**
  (`auth.router`). O candidato emite eventos `public_auth.*` (structlog). Ver `user.login`
  ao depurar o portal é um **falso positivo** (red herring).

---

## 4. Fluxo cookie/session atual

Atributos do cookie (idênticos em login e Google —
`public_candidate_portal.py:148-156` e `:193-201`):

| Atributo | Valor |
|---|---|
| Nome | `candidate_portal_token` |
| HttpOnly | `True` |
| SameSite | `lax` |
| Secure | `request.url.scheme == "https"` → **False** em dev HTTP |
| Domain | **não definido** (host-only) |
| Path | `/` |
| Max-Age | `PORTAL_SESSION_TTL_HOURS * 3600` = **86400s (24h)** |

Leitura no backend: `get_current_candidate_session`
(`dependencies.py:121`) lê via `Cookie(alias=CANDIDATE_PORTAL_COOKIE_NAME)` →
`authenticate()` faz `sha256` e busca `portal_session` não-usado e não-expirado. **Não usa
Bearer.**

CORS (`main.py:105-109, 275-283`): em dev usa
`allow_origin_regex = https?://(localhost|127\.0\.0\.1|10\.x|192\.168\.x)(:porta)?` com
`allow_credentials=True`. **Confirmado por teste**: origens `localhost:5174`,
`127.0.0.1:5174` e `192.168.1.88:5174` recebem `access-control-allow-origin` ecoado +
`allow-credentials: true`. **CORS não é o bloqueador.**

Frontend: `publicApiClient` usa `credentials: 'include'` em **todos** os métodos
(`get/post/put/postForm`). ✔

**Respostas exigidas:**

- **Funciona FE `localhost:5174` + API `localhost:8000`?** **Sim** — mesmo site
  (porta é irrelevante para SameSite); Lax envia o cookie no `fetch`; Secure não exigido
  em HTTP same-site.
- **Funciona FE `192.168.1.88:5174` + API `192.168.1.88:8000`?** **Sim** — mesmo site.
- **Quebra ao misturar `localhost`/`127.0.0.1`/`192.168.1.88`?** **Sim.** Hosts diferentes
  = cross-site. `SameSite=Lax` **não** envia o cookie em `fetch`/XHR cross-site (só em
  navegação top-level GET). Resultado: cookie definido, mas `/me` 401. **← causa raiz.**
- **O `.env` atual induz mistura?** Hoje **não** — `candidate-portal/.env` aponta tudo
  para `localhost`. O risco aparece quando se roda `vite --host` e abre a app pela LAN
  (`192.168.1.88:5174`) mantendo a API em `localhost`. (Adicionalmente, o backend
  `CANDIDATE_PORTAL_PUBLIC_URL` tem default `127.0.0.1:5174`, divergente do `localhost`
  do FE — ver §5.)
- **Precisa de `Domain` no cookie?** **Não.** Host-only é o correto; definir `Domain` não
  resolve o bloqueio cross-site por SameSite.
- **`SameSite=Lax` é suficiente?** Sim **apenas** com host alinhado FE↔API. Para
  cross-host exigiria `SameSite=None; Secure`, o que requer **HTTPS** (inviável em dev
  HTTP puro).
- **`Secure=false` em dev está correto?** Sim, para HTTP same-host. Se um dia for
  cross-host, precisará de HTTPS + `SameSite=None`.

---

## 5. Matriz de hipóteses testadas

| # | Hipótese | Evidência | Veredito | Arquivo/linha |
|---|---|---|---|---|
| H1 | Cookie não é criado no login | `set_cookie` presente em login e Google; `create_session` sempre chamado | **Refutada** | `public_candidate_portal.py:148-156, 193-201`; `candidate_google_auth_service.py:59` |
| H2 | Cookie criado no host errado / não enviado (cross-site SameSite=Lax) | Cookie `SameSite=Lax`, host-only; CORS permite múltiplos hosts mas SameSite bloqueia reenvio cross-site em fetch | **Confirmada (raiz)** | `public_candidate_portal.py:152,197`; `main.py:105-109` |
| H3 | CORS bloqueia o portal | OPTIONS para `localhost/127.0.0.1/192.168.1.88:5174` ecoam origin + `allow-credentials:true` | **Refutada** | `main.py:275-283`; teste curl OPTIONS |
| H4 | Confusão entre auth staff e candidate | Staff=Bearer/JWT; candidate=Cookie alias `candidate_portal_token` | **Refutada** | `dependencies.py:34-56 vs 121-136` |
| H5 | `needs_completion` não cria sessão | `create_session` roda antes de calcular `status` | **Refutada** | `candidate_google_auth_service.py:59-65` |
| H6 | `/me` exige perfil completo (bloqueia Google novo) | `/me` usa `CurrentCandidateSession` (básico); `get_me` só falha se candidato inexistir | **Refutada** | `candidate_portal_area.py:61-66`; `candidate_portal_service.py:241-244` |
| H7 | Usuário/candidato sem `password_hash` | 19/32 candidatos ativos com `password_hash` NULL | **Confirmada (secundária)** | query: `SELECT count(*) … password_hash IS NULL` |
| H8 | Apply não persiste senha do candidato novo | `candidate.password_hash = hash_password(password)` no caminho de candidato novo | **Refutada** | `public_application_service.py:280` |
| H9 | 401 de senha errada vs sem-senha indistinguíveis | ambos caem em `InvalidCredentials` → mesma mensagem 401 | **Confirmada** | `candidate_portal_auth_service.py:101-104`; `public_candidate_portal.py:210-212` |
| H10 | `/me` usa Bearer por engano | dependência lê `Cookie(alias=…)`, sem Bearer | **Refutada** | `dependencies.py:121-136` |
| H11 | Token/senha/id_token vaza em log | só nomes de evento; sem valores. **Exceção**: dev fallback loga `setup_url`+email (gated dev/test) | **Parcial** | `candidate_portal_auth.py:125-144` |
| H12 | `.env` do backend malformado afeta CORS | linha 1 `CORS_ORIGINS=[…]APP_ENV=development` sem newline + `CORS_ORIGINS` duplicado | **Confirmada (risco, não bloqueador)** | `backend/.env:1-4` |
| H13 | Link de setup de senha aponta p/ host inacessível em dev | `candidate_portal_public_url` default `127.0.0.1:5174`; Vite só escuta `localhost` | **Confirmada (risco)** | `settings.py:274-279`; `vite.config.ts` |
| H14 | Vite acessível pela LAN por padrão | `server:{port:5174}` sem `host`; `127.0.0.1:5174` deu connection refused | **Refutada** (só com `--host`) | `vite.config.ts` |

---

## 6. Causa raiz mais provável

**Cross-site cookie blocking por divergência de host (H2), agravado pela
indistinguibilidade do 401 e por candidatos sem `password_hash` (H7/H9).**

Sequência que reproduz o sintoma "tokeninfo 200 → `/me` 401":

1. Dev roda `vite --host` e abre o portal em `http://192.168.1.88:5174` (ou usa
   `127.0.0.1` enquanto a API está em `localhost`).
2. A API permanece em `http://localhost:8000` (valor do `.env`).
3. Login/Google sucede no servidor → `Set-Cookie: candidate_portal_token` é aceito pelo
   navegador (associado ao host da **API**), com `SameSite=Lax`.
4. `CandidateHomePage` chama `/me` via `fetch` a partir de um **site diferente** →
   navegador **não anexa** o cookie Lax (não é navegação top-level).
5. Backend não vê o cookie → `get_current_candidate_session` → **401**.

Quando FE e API estão no **mesmo host** (estado atual do `.env`, ambos `localhost`), o
fluxo funciona. Por isso o problema é **intermitente/ambiental**, não um bug de lógica.

---

## 7. Correções necessárias

### Must-fix
1. **Alinhar host FE↔API.** Garantir que a página e a API usem o **mesmo host**
   (tudo `localhost`, ou tudo `127.0.0.1`, ou tudo `192.168.1.88`). Documentar como regra
   dura no `.env.example` do candidate-portal.
2. **Corrigir o `.env` do backend malformado** (`backend/.env:1`): separar
   `CORS_ORIGINS` e `APP_ENV` em linhas distintas e remover a duplicação de
   `CORS_ORIGINS`. (Hoje funciona só porque o regex de dev cobre tudo — frágil.)
3. **UX do 401 sem `password_hash`.** Como 19/32 candidatos não têm senha, a tela de login
   já direciona para *Recuperar/criar senha*; reforçar essa orientação no 401 (sem revelar
   existência). Já endereçado em fases anteriores; validar que a mensagem cobre o caso.

### Should-fix
4. **Alinhar `CANDIDATE_PORTAL_PUBLIC_URL`** (default `127.0.0.1:5174`) ao host real do FE
   em dev (`localhost:5174`), senão o link de *definir-senha* gerado no e-mail/fallback
   aponta para um host que o Vite não serve (`127.0.0.1` dá connection refused). Definir
   explicitamente no `backend/.env`.
5. **Receita de acesso por LAN.** Documentar: para abrir via `192.168.1.88`, servir API e
   FE **ambos** nesse IP e setar `VITE_PUBLIC_API_BASE_URL=http://192.168.1.88:8000/api/v1/public`
   + `CANDIDATE_PORTAL_PUBLIC_URL=http://192.168.1.88:5174`.

### Could-fix
6. **HTTPS local + `SameSite=None; Secure`** se realmente for necessário FE e API em hosts
   distintos. Alto custo (certs locais); só se houver requisito real.
7. **Diferenciar (server-side log, sem vazar ao cliente)** o caso "candidato sem senha"
   para observabilidade, mantendo a resposta pública genérica.

---

## 8. Plano de implementação recomendado

1. **Padronizar host em `localhost`** para todo o dev local:
   - `candidate-portal/.env`: manter `VITE_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1/public`.
   - `backend/.env`: corrigir linhas e adicionar `CANDIDATE_PORTAL_PUBLIC_URL=http://localhost:5174`.
   - Documentar no `.env.example` a regra "FE e API no mesmo host".
2. **Sanear `backend/.env`** (CORS_ORIGINS em linha própria, sem duplicar; APP_ENV em
   linha própria).
3. **Validar end-to-end** com o smoke Playwright usando credenciais reais de um candidato
   **com** `password_hash` (ver §9), em `localhost`.
4. **Adicionar guard de host** (could-fix): aviso no console do portal se
   `window.location.hostname` ≠ hostname de `VITE_PUBLIC_API_BASE_URL` (sem vazar nada),
   para detectar a armadilha cedo.

> Tudo acima é **proposta**. Nada foi implementado nesta fase.

---

## 9. Testes que precisam ser adicionados/ajustados

Cobertura atual:

- **Backend** (`test_candidate_portal_and_public_analysis.py`): bom — `/me`,
  `/me/applications`, ownership, `session` probe, password-setup genérico, dev-fallback
  gated. Usa cookie `candidate_portal_token` real (`:267, :315, …`).
- **E2E** (`candidate-portal-smoke.spec.ts`): cobre rotas públicas, 401 de login,
  recuperação genérica, `/minha-area` sem sessão. O teste de **login real** (`:100`) e o de
  **409** estão `test.skip` sem credenciais.

Lacunas a cobrir:

1. **Login real executado em CI/local** com `E2E_CANDIDATE_EMAIL`/`E2E_CANDIDATE_PASSWORD`
   de um candidato com `password_hash` — valida `Set-Cookie` HttpOnly + `/me` 200 +
   `/me/applications` 200.
2. **Google `needs_completion`** — fluxo cria sessão e `/me` deve responder 200 (mockando
   o verifier no backend; sem `id_token` real).
3. **Regressão de host mismatch** — teste que documenta que FE host ≠ API host derruba o
   cookie (pode ser um teste de contrato/documentação, não necessariamente browser).
4. **401 para candidato sem `password_hash`** — backend: garantir 401 genérico (sem
   vazar) e que o fluxo de recuperação cria a senha e habilita login.

---

## 10. Riscos de segurança

1. **Dev fallback loga token de password-setup + e-mail** (`candidate_portal_auth.py:125-144`),
   gated a `APP_ENV ∈ {development, test}`. Em dev sem SMTP, **todo** request de
   recuperação grava o `setup_url` (com token) e o e-mail do candidato no log. É a escotilha
   intencional para dev local, mas é **token em log** — manter estritamente fora de
   staging/produção e tratar logs de dev como sensíveis. (Sem ação de código nesta fase.)
2. **`backend/.env` malformado** (CORS_ORIGINS colado a APP_ENV; CORS_ORIGINS duplicado):
   risco de, ao desligar o regex de dev (ou em refactor), o CORS ficar com valor inesperado.
3. **Nenhum vazamento** de `id_token`, senha ou cookie nos logs de produção dos serviços de
   auth do candidato (apenas nomes de evento). O smoke E2E sanitiza tokens/e-mails nos
   diagnósticos (`sanitizeDiagnosticText`). ✔
4. **Indistinguibilidade do 401** (senha errada vs sem senha) é **correta** para
   anti-enumeração; o risco é apenas de UX, não de segurança.

---

## 11. Confirmação

- **não alterei código** ✓ (apenas criei este relatório em `.design/`)
- **não criei mock** ✓
- **não inventei usuário** ✓ (consultei contagens agregadas; e-mails mascarados)
- **não loguei segredo** ✓ (nenhum token/senha/cookie/id_token impresso)
- **não fiz commit** ✓
- **não fiz deploy** ✓
