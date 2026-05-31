# CP-Audit-Login-Cadastro — Diagnóstico do fluxo candidatura/cadastro/login

**Data:** 2026-05-31
**Tipo:** Auditoria read-only — nenhum código alterado.

---

## 1. Arquivos lidos

**candidate-portal/**
- `src/services/publicApplicationService.ts`
- `src/services/candidateAuthService.ts`
- `src/services/publicApiClient.ts`
- `src/pages/ApplicationFormPage.tsx`
- `src/pages/CandidateLoginPage.tsx`
- `src/pages/CandidateHomePage.tsx`

**backend/**
- `src/application/services/public_application_service.py`
- `src/application/services/candidate_portal_auth_service.py`
- `src/application/services/candidate_service.py`
- `src/infrastructure/repositories/sqlalchemy_candidate_repository.py`
- `src/infrastructure/database/models/candidate_model.py`
- `src/interface/api/routers/public.py`
- `src/interface/api/routers/public_candidate_portal.py`
- `tests/test_public_application.py` (+ extended, null_created_by)

---

## 2. Endpoints encontrados

| Função | Método | Endpoint | Existe? |
|---|---|---|---|
| Listar vagas | GET | `/api/v1/public/jobs` | ✅ |
| Candidatura | POST | `/api/v1/public/candidates/apply` | ✅ |
| Login candidato | POST | `/api/v1/public/auth/login` (alias) / `/candidate-auth/login` | ✅ |
| Logout | POST | `/api/v1/public/auth/logout` | ✅ |
| Overview área candidato | GET | `/api/v1/public/candidate-portal/overview` | ✅ |
| **Primeiro acesso / criar senha** | — | — | ❌ **NÃO EXISTE** |
| **Recuperar/redefinir senha** | — | — | ❌ **NÃO EXISTE** |

> O único `reset_password` do sistema é para **usuários internos** (`internal_users.py`), não para candidatos.

---

## 3. Models/tabelas envolvidos

- **`candidates`** (`CandidateModel`) — guarda o candidato **e** as credenciais do portal:
  - `password_hash` — **nullable** (pode ser NULL)
  - `password_created_at` — nullable
  - `google_sub` — login Google
  - `archived_at`, `deleted_at` — soft-delete/arquivamento
  - Índices únicos parciais: `uq_candidates_active_email`, `uq_candidates_active_cpf` (só para candidatos ativos)
- **`candidate_auth_tokens`** (`CandidateAuthTokenModel`) — sessões do portal (cookie `candidate_portal_token`)
- **`resumes` / `resume_versions`** — currículo
- **`candidate_job_pipeline`** — vínculo candidato↔vaga (pipeline)

➡️ **Não há tabela separada de "usuário candidato".** O login do candidato usa a própria linha em `candidates` (`password_hash`). É um modelo de identidade unificado.

---

## 4. Fluxo real atual, passo a passo

### Candidatura (`POST /candidates/apply`)
1. Valida LGPD, normaliza CPF/e-mail/telefone, valida senha (mín. 8).
2. Busca `existing_by_cpf` e `existing_by_email` (somente candidatos **ativos**).
3. **Decisão de identidade (sem sessão Google):**
   - Se CPF existe **e** e-mail existe em candidatos **diferentes** → **409** (mensagem genérica).
   - Se CPF existe → exige `verify_password(senha, password_hash)`; **se não bater (ou não houver hash) → 409**.
   - Se e-mail existe → idem → **se não bater → 409**.
   - Se nenhum existe → cria candidato novo.
4. Se candidato existente tem pipeline **ativo** → **409** "Você já possui uma candidatura em andamento."
5. **Candidato novo:** `CandidateService.create()` cria a linha **sem senha**, e logo depois o serviço seta `password_hash = hash_password(password)` (linha 280). ✅ senha é persistida.
6. Cria resume + versão, grava arquivo.
7. Se `job_id`: cria/reativa pipeline entry, dispara análise IA + assignment comportamental.
8. Seta cookie de sessão e retorna 201.

### Login (`POST /auth/login`)
1. Busca candidato ativo por e-mail.
2. **Exige `password_hash` não-nulo E `verify_password` OK.** Senão → **401** "E-mail ou senha inválidos."
3. Cria sessão (cookie) e retorna.

### Criação interna (RH importa/cadastra candidato)
- `CandidateService.create()` monta o `CandidateModel` **sem `password_hash`** → candidato fica com `password_hash = NULL`.

---

## 5. Onde exatamente o fluxo quebra

**Mensagem vista pelo usuário** = `GENERIC_EXISTING_ACCOUNT_MESSAGE`
("Recebemos sua solicitação. Se já houver cadastro, atualizaremos seu processo conforme as regras do RH.")
→ é um **409 CONFLICT** disparado em `public_application_service.py` quando **já existe um candidato com aquele e-mail ou CPF, mas a senha informada não confere** (caso clássico: o candidato existe **sem `password_hash`**).

### O deadlock
Quando o candidato **já existe sem senha** (importado pelo RH, criado no portal antigo, seed, ou cadastro internalizado):

| Ação | Resultado | Causa no código |
|---|---|---|
| Candidatar-se de novo | **409** genérico | `existing_by_email/cpf` sem `password_hash` → `verify_password` falha → `PublicApplicationExistingAccountError` (linhas 211–218) |
| Fazer login | **401** | `not password_hash` → `CandidatePortalInvalidCredentialsError` (auth service, linha 87) |
| Criar senha / primeiro acesso | **impossível** | **endpoint não existe** |
| Recuperar senha | **impossível** | **endpoint não existe** |

➡️ O candidato fica **preso**: não consegue se candidatar (409), não consegue logar (401) e **não há rota de criar/recuperar senha**.

> Observação: para um candidato **100% novo** (e-mail e CPF inéditos), o fluxo funciona — cria com senha e o login funciona. O problema é **exclusivamente** para e-mails/CPFs que **já existiam** na base sem senha correspondente.

---

## 6. Backend, frontend ou ambos?

**Predominantemente BACKEND (regra de negócio incompleta).**

- **Backend:** não existe fluxo de "primeiro acesso / definir senha" para candidato pré-existente sem `password_hash`, nem "recuperar senha". A política trata "existe sem senha que confere" como conflito anônimo (correto por segurança/privacidade), mas **não oferece a saída legítima** ao dono real do e-mail/CPF.
- **Frontend (secundário):** a tela de candidatura mostra o 409 como erro genérico e **não orienta** o candidato ("você já tem cadastro — faça login" ou "defina sua senha"). O login também só mostra "E-mail ou senha inválidos", sem caminho de primeiro acesso/recuperação.

---

## 7. O que precisa ser implementado na próxima fase

**Mínimo para destravar (ordem de prioridade):**

1. **Backend — Fluxo "primeiro acesso / definir senha"** para candidato existente sem `password_hash` (e "esqueci minha senha" para quem tem). Padrão seguro:
   - `POST /public/auth/request-access` (recebe e-mail/CPF, **sempre responde 200 genérico** para não revelar existência) → gera token em `candidate_auth_tokens` (purpose distinto, ex. `password_setup`) e envia por e-mail.
   - `POST /public/auth/set-password` (token + nova senha) → seta `password_hash`.
2. **Backend — Decisão de produto sobre o 409 na candidatura:** quando o e-mail/CPF já existe sem senha, em vez de só bloquear, permitir disparar o fluxo de definir-senha (sem expor existência ao anônimo).
3. **Frontend (candidate-portal):**
   - Na candidatura, ao receber 409 genérico, oferecer CTA: "Já tem cadastro? Acesse sua área" e "Definir/recuperar senha".
   - Na tela de login, link "Primeiro acesso / esqueci minha senha".
   - Tela de definir senha via token.

> Não implementar agora — esta fase é só diagnóstico.

---

## 8. Riscos

- **Privacidade/enumeração:** qualquer fluxo de "primeiro acesso/recuperação" deve responder **sempre genérico** (200) e nunca confirmar se e-mail/CPF existe. O backend já segue esse princípio no apply — manter.
- **Identidade unificada candidato:** como login e candidatura compartilham a linha `candidates`, alterar `password_hash` afeta ambos. Definir senha precisa de verificação de posse (token por e-mail).
- **Candidatos importados pelo RH:** todos têm `password_hash = NULL` → **todos** caem no deadlock se tentarem usar o portal. O volume pode ser alto.
- **Conta Google:** candidatos com `google_sub` têm caminho de login alternativo (Google), mas o novo `candidate-portal/` **não** integra Google OAuth — então mesmo eles podem não conseguir entrar pelo novo portal.
- **Mensagem genérica no apply** é correta por segurança, mas **piora a UX** sem um CTA de saída.

---

## 9. Testes existentes relacionados

- `tests/test_public_application.py`:
  - `test_apply_rejects_duplicate_email` / `test_apply_rejects_duplicate_cpf` → confirmam que **re-candidatura com a MESMA senha reaproveita o cadastro (201)**; com senha diferente/sem senha → 409.
  - `test_apply_blocks_existing_candidate_with_active_pipeline` → 409 "já possui candidatura em andamento" (mensagem diferente).
  - `test_apply_reopens_terminal_pipeline_for_same_job...`, `test_apply_allows_new_job_when_previous_job_is_terminal...`
- `tests/test_public_application_extended.py`, `tests/test_public_application_null_created_by.py`.
- **Não há** teste de "primeiro acesso", "definir senha" ou "recuperar senha" de candidato — porque o fluxo **não existe**.

---

## 10. Confirmação explícita

- ✅ **Não alterei código.**
- ✅ **Não criei mock.**
- ✅ **Não inventei endpoint** (os endpoints listados foram lidos do código real).
- ✅ **Não fiz commit.**
- ✅ **Não fiz deploy.**

---

## Correção correta (resumo objetivo)

O candidato consegue **enviar candidatura real** e **não duplicar** hoje — desde que o e-mail/CPF seja inédito **ou** ele informe a mesma senha do primeiro cadastro. O que falta para ele **acompanhar candidaturas e acessar a área** é:

1. Um **endpoint de "primeiro acesso / definir senha"** (token por e-mail) para candidatos que já existem sem `password_hash` (importados pelo RH, portal antigo, seed) — hoje eles estão em **deadlock** (409 no apply, 401 no login, sem rota de senha).
2. Um **endpoint de "recuperar senha"** para quem esqueceu.
3. **UX no candidate-portal** que, diante do 409 genérico e do 401 de login, ofereça os caminhos "Acessar minha área" e "Definir/recuperar senha".

A raiz é **backend (regra de negócio incompleta)**; o frontend agrava por não orientar o usuário.
