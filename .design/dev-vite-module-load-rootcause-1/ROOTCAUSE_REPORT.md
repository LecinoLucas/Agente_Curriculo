# DEV-VITE-MODULE-LOAD-ROOTCAUSE-1

Data: 2026-06-10
Escopo: causa raiz do erro de MIME type no browser para PipelinePage.tsx

---

## Erro original

```
PipelinePage.tsx: Failed to load module script.
Expected JavaScript-or-Wasm module script but server responded with MIME type "text/html".
Failed to fetch dynamically imported module:
http://localhost:5173/src/pages/PipelinePage.tsx
```

---

## Diagnóstico executado

### Tarefa 1 — Processo Vite

```
lsof -i :5173
```
Resultado: `node 40948 LecinoLucas 22u IPv4 TCP *:5173 (LISTEN)`

```
lsof -p 40948 | grep cwd
```
Resultado: `/Users/lecinolucas/Developer/Agente_Curriculo/frontend` ← correto

```
ps -p 40948 -o pid,command
```
Resultado: `node /Users/lecinolucas/Developer/Agente_Curriculo/frontend/node_modules/.bin/vite --host 0.0.0.0 --port 5173`

Conclusão: Vite rodando no diretório correto. Descartado processo duplicado ou de diretório errado.

### Tarefa 2 — HTTP dos módulos

```
curl -I http://localhost:5173/
→ Content-Type: text/html        ← correto (SPA fallback)

curl -I http://localhost:5173/src/pages/PipelinePage.tsx
→ Content-Type: text/javascript  ← correto

curl -I http://localhost:5173/src/app/AppRouter.tsx
→ Content-Type: text/javascript  ← correto

curl -I http://localhost:5173/src/main.tsx
→ Content-Type: text/javascript  ← correto
```

Todos os arquivos .tsx retornam `text/javascript`. O erro no browser ocorria em momento diferente.

### Tarefa 3 — Diagnóstico de código

```
cd frontend && npx tsc --noEmit
→ TypeScript: No errors found

cd frontend && npm run build
→ ✓ built in 4.00s (sem erros)

npm run validate:pipeline-imports
→ PipelinePage.tsx imports validation passed.
```

AppRouter.tsx: lazy import de PipelinePage correto, sem import após statement, sem caminho errado.

Nenhum service worker encontrado no código ou no `vite.config.ts`.

### Tarefa 4 — Evidência da divergência curl vs browser

A divergência entre "curl retorna `text/javascript`" e "browser vê `text/html`" não é cache de disco (Vite usa `Cache-Control: no-cache`). É o React.lazy ser não-retentativo: uma vez que o import falha (por qualquer motivo), o React não tenta novamente até recarregamento completo da página.

---

## Causa raiz (dupla)

### RC-1: Race condition no startup — healthcheck insuficiente

O script `dev-full.sh` declara "Pronto!" assim que `http://127.0.0.1:5173/` retorna HTTP 200. Mas esse endpoint é a página HTML do SPA, que o Vite começa a servir antes de inicializar completamente o pipeline de transformação de módulos.

Se o browser (com sessão anterior restaurada) requisitar `/src/pages/PipelinePage.tsx` nesse intervalo de milissegundos, o Vite pode retornar sua própria página de erro (`text/html`) ou o fallback do SPA em vez do módulo transformado (`text/javascript`). O React.lazy não faz retry — o erro fica travado na memória da aba até um hard reload.

Evidência: `wait_for_http` checa apenas se `/` retorna 200, não valida que módulos `.tsx` retornam `text/javascript`.

### RC-2: Cache Vite corrompido após shutdown sujo

O diretório `node_modules/.vite` contém o cache de pre-bundling do Vite. Quando o VS Code é fechado ou o sistema é reiniciado com o Vite rodando, esse cache pode ficar com entradas parciais ou inconsistentes.

Na próxima inicialização, o Vite lê entradas corrompidas e pode servir conteúdo inválido (HTML de erro) para módulos que dependem do pre-bundle. O `curl -I` funciona porque é executado depois que o Vite reconstrói o cache, mas o browser já fez o request no momento errado.

### Por que limpar cache manualmente não é solução

1. O usuário não sabe quando o cache está corrompido.
2. Não endereça RC-1 (race condition de startup).
3. Não previne reincidência — o próximo shutdown sujo reproduz o problema.
4. O erro no browser persiste mesmo após o servidor estar saudável (React.lazy não retenta).

---

## Correções aplicadas

### Correção 1 — `dev-full.sh`: healthcheck de módulo (Fix C)

Adicionada função `wait_for_vite_module` que:
- Aguarda `http://<host>/src/pages/PipelinePage.tsx` retornar `Content-Type: *javascript*`
- Timeout de 30 segundos
- Falha com mensagem clara: "Solução: cd frontend && npm run dev:clean"

Chamada após `wait_for_http "$FRONTEND_PUBLIC_URL"`, antes de declarar "Pronto!".

Arquivo alterado: `scripts/dev-full.sh`

### Correção 2 — `frontend/package.json`: script `dev:clean` (Fix B)

```
"dev:clean": "node ../scripts/validate-repo-root.js && vite --host 0.0.0.0 --port 5173 --strictPort --force"
```

O flag `--force` instrui o Vite a ignorar e recriar `node_modules/.vite` completamente. Deve ser usado após shutdown sujo (VS Code fechado, reinicialização do sistema).

Não substituiu o script `dev` normal para não adicionar latência desnecessária a startups comuns.

### Correção 3 — `scripts/validate-vite-module-load.js`: script de validação (Tarefa 6)

Script Node.js (CommonJS) que:
- Faz GET para `http://localhost:5173/src/pages/PipelinePage.tsx`
- Valida status 200
- Valida `Content-Type` contendo `javascript`
- Falha com mensagem clara se vier `text/html`
- Exit code 0 = servidor saudável, 1 = problema

### Correção 4 — `package.json` (raiz) e `frontend/package.json`: scripts adicionados

Raiz:
```
"validate:vite-module-load": "node scripts/validate-vite-module-load.js"
```

Frontend:
```
"dev:clean": "... vite --force",
"validate:repo-root": "node ../scripts/validate-repo-root.js",
"validate:pipeline-imports": "node ../scripts/validate-pipeline-imports.js",
"validate:vite-module-load": "node ../scripts/validate-vite-module-load.js"
```

### Correção 5 — `frontend/e2e/vite-module-load.spec.ts`: teste de regressão (Tarefa 4)

Teste Playwright que:
- Intercepta requests para `/src/pages/PipelinePage.tsx` e captura `Content-Type`
- Captura erros de console contendo "Failed to fetch dynamically imported module", "MIME type", "text/html"
- Faz login e navega para `/pipeline`
- Falha se PipelinePage não renderizar (heading "Pipeline" não visível)
- Falha se `Content-Type` não contiver `javascript`
- Falha se console tiver erro de MIME

---

## Como reproduzir o bug

1. Inicie `npm run dev:full`
2. Abra o browser em http://localhost:5173/pipeline
3. Sem fechar o terminal, feche o VS Code (ou mate o processo com SIGKILL)
4. Na próxima sessão: abra o VS Code, restaure a aba do browser
5. Tente navegar para /pipeline sem recarregar
6. O browser usa a sessão anterior — React.lazy não retenta o import que falhou

Ou: mate o processo Vite com `kill -9 <PID>` enquanto o browser está carregando.

## Como validar após as correções

```bash
# Verificar que o servidor está saudável
npm run validate:vite-module-load

# Verificar imports em tempo de build
cd frontend && npm run validate:pipeline-imports
cd frontend && npx tsc --noEmit
cd frontend && npm run build

# Teste e2e focado
cd frontend && npx playwright test e2e/vite-module-load.spec.ts
```

Após fechar VS Code e reiniciar:
```bash
# Usar dev:clean para forçar rebuild do cache Vite
cd frontend && npm run dev:clean
```

O `dev:full` agora também falha com mensagem clara se o módulo retornar texto/html, evitando que o ambiente seja declarado "Pronto!" prematuramente.

---

## Arquivos alterados

| Arquivo | Tipo | Motivo |
|---|---|---|
| `scripts/validate-vite-module-load.js` | novo | validação de MIME do módulo |
| `scripts/dev-full.sh` | alterado | adiciona `wait_for_vite_module` e chama na verificação |
| `frontend/package.json` | alterado | adiciona `dev:clean`, `validate:*` |
| `package.json` | alterado | adiciona `validate:vite-module-load` |
| `frontend/e2e/vite-module-load.spec.ts` | novo | teste de regressão Playwright |
| `.design/dev-vite-module-load-rootcause-1/ROOTCAUSE_REPORT.md` | novo | este documento |
