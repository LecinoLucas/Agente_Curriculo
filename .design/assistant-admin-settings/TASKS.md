# OP-6H-3A — Tasks — Fases implementáveis (vertical slices)

Data: 2026-06-02
Status: **Em execução.** OP-6H-3B concluiu o Marco A e OP-6H-3C concluiu o
Marco B read-only; os demais marcos seguem pendentes. Cada item é uma fatia vertical
(DB → API → testes → UI) entregável e
revisável isoladamente.

Convenção de checklist: `[ ]` pendente. Sufixos de fase sugeridos entre parênteses.

## Marco A — Persistência e seed (backend, sem mudar a engine)

- [x] **A1 (OP-6H-3B)** Migration + modelos `assistant_state_contents`,
  `assistant_quick_replies`, `assistant_settings` (VARCHAR+CHECK, UUID, timestamps).
  Seed = strings/valores **idênticos** aos de `conversation_state_machine.py` e
  `conversation_service.py` (incl. `default_max_attempts=3`). Sem tocar a engine.
  - Aceite: `alembic upgrade` cria tabelas; seed bate 1:1 com o código; testes de
    modelo/seed.
- [x] **A2 (OP-6H-3B)** Catálogos em código: `allowed_quick_reply_values[state]` e
  `allowed_placeholders[state]` (whitelists), com testes.

## Marco B — Endpoints de leitura (read-only)

- [x] **B1 (OP-6H-3C)** `GET /states` (catálogo fixo dos estados reais, read-only)
  + RBAC `HrRecruiterOrAdmin`. Testes de integração.
- [x] **B2 (OP-6H-3C)** `GET /state-contents`,
  `GET /state-contents/{state}` e `GET /quick-replies` sobre tabelas persistidas.
  Testes.
- [x] **B3 (OP-6H-3C)** `GET /settings` com `value_json=null` para settings
  sensíveis. Testes.

## Marco C — Frontend leitura

- [ ] **C1 (OP-6H-3D)** Service: `listStates/listStateContents/getSettings` + tipos.
  Aba "Fluxo de perguntas" deixa de ser `disabled`; timeline read-only dos 10 estados;
  aba "Configurações" read-only. Reuso de componentes; sem `ui-*`. Testes + build.

## Marco D — Edição de conteúdo (write path do admin)

- [ ] **D1 (OP-6H-3E)** `PATCH /state-contents/{state}` com **todas** as validações
  (não-vazio, placeholders, faixa `max_attempts`, catálogo de quick reply, anti-PII,
  estados sensíveis) + auditoria via `AuditService` + invalidação de cache. Testes
  cobrindo cada validação e o 422.
- [ ] **D2 (OP-6H-3E)** `PATCH /settings/{key}` (tipos, faixas, `channels_enabled`
  sem whatsapp, sensível só admin) + auditoria. Testes.
- [ ] **D3 (OP-6H-3F)** Frontend: formulários de edição de estado (prompt/helper/
  fallback/max_attempts/quick replies com chips de placeholder) e de settings; espelho
  das validações; banners de estado sensível; confirmação em `assistant_enabled`.
  Testes + build.

## Marco E — Integração com a engine (read path) — **alto risco**

- [ ] **E1 (OP-6H-3G)** `AssistantContentProvider` (loader com cache + **fallback para
  defaults de código**). `prompt_for()` e `_record_failure()` passam a consultar o
  provider sem mudar a topologia. **Regression review dedicado**; rodar suíte de
  conversa + `portal-2-conversation-smoke`.
  - Aceite: com seed = código, todos os testes de conversa existentes permanecem
    verdes; editar conteúdo no painel altera o próximo turno; rollback trivial
    (desligar provider → defaults de código).
- [ ] **E2 (OP-6H-3G)** `default_max_attempts` global vira a fonte do limite (substitui
  uso direto de `_FAILURE_ATTEMPT_LIMIT`, que vira fallback). Revisar efeito no sufixo
  `_attempt_limit` das Falhas.

## Dependências

```
A1 → A2 → B1/B2/B3 → C1
A2,B2 → D1 ; B3 → D2 ; D1,D2 → D3
B2 → E1 → E2   (E só depois de A–D estáveis)
```

## Definição de pronto (por fatia)

- Migrations reversíveis; modelos com CHECK; seed 1:1 com código.
- Endpoints com RBAC + auditoria + testes de integração (inclui caminhos 403/422).
- Frontend com testes (vitest) + `npm --prefix frontend run build` verde, sem `ui-*`.
- Nenhuma alteração em CandidateApplication, pipeline, WhatsApp, matching/IA,
  pré-admissão; engine tocada **apenas** no read path do Marco E, com regression review.
- Guardas do `RISKS_AND_GUARDS.md` verificadas no checklist do PR.
