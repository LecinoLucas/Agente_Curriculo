# Candidate Portal no CI

## Problema encontrado

A auditoria `PROD-READINESS-AUDIT-1` identificou que o `candidate-portal` nao era validado no GitHub Actions. O workflow `.github/workflows/ci.yml` executava apenas os jobs `backend` e `frontend`.

## CI antes e depois

### Antes

- Job `backend` para validacoes e testes do backend.
- Job `frontend` para instalar dependencias, rodar `vitest` pontual e executar `npm run build`.
- Nenhuma etapa ou job voltado ao `candidate-portal`.

### Depois

- Mantidos os jobs `backend` e `frontend` sem alteracoes funcionais.
- Adicionado o job `candidate-portal`.
- O novo job usa `actions/setup-node@v4` com Node `20`.
- O novo job usa cache `npm` com `candidate-portal/package-lock.json`.
- O novo job executa:
  - `npm ci`
  - `npm run build`

## Comando local validado

Comando executado localmente no diretorio `candidate-portal`:

```bash
npm run build
```

Resultado validado:

- `tsc && vite build` executado com sucesso.
- Build de producao concluido sem necessidade de alterar arquivos do portal.

## Prova de que `candidate-portal/src` nao foi alterado

As alteracoes desta fase ficaram restritas a:

- `.github/workflows/ci.yml`
- `.design/prod-hardening-1f/CANDIDATE_PORTAL_CI.md`

Nao houve edicao em:

- `candidate-portal/src`
- `candidate-portal/pages`
- `candidate-portal/services`
- `candidate-portal/package.json`

## Riscos restantes

- O CI do portal valida apenas instalacao e build; nao adiciona testes automatizados do Candidate Portal.
- Como a validacao depende de `npm ci`, futuras quebras por lockfile ou dependencia transitiva passarao a aparecer no GitHub Actions, o que e desejado para detectar regressao cedo.
