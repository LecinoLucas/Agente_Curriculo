# DEV-HOST-CANONICALIZATION-1

Data: 2026-06-10
Contexto: complementa ROOTCAUSE_REPORT.md (RC-1/RC-2)

---

## Problema

O frontend apresentava erro de MIME type ao acessar por `localhost:5173`, mas
funcionava em `<IP-da-rede>:5173`. Indicava divergência de origem entre sessões.

---

## Por que `localhost` ≠ `127.0.0.1` no browser

Do ponto de vista do browser são **origens completamente diferentes**:

| Atributo           | `localhost:5173`           | `127.0.0.1:5173`           |
|--------------------|----------------------------|----------------------------|
| `localStorage`     | isolado                    | isolado (separado)         |
| Cookie `SameSite=Lax` | domínio `localhost`     | domínio `127.0.0.1`        |
| Cache HTTP modules | namespace próprio          | namespace próprio          |
| `sessionStorage`   | isolado                    | isolado (separado)         |

Consequência: ao alternar entre os dois hosts o browser cria sessões novas
(token não encontrado em localStorage) e caches novos (Vite pode retornar
texto/html de lazy imports em módulos não-cacheados naquela origem).

O erro de MIME type era o sintoma do cache Vite da origem `localhost:5173`
estar stale enquanto a origem `127.0.0.1:5173` tinha cache limpo — ou vice-versa.

---

## Host canônico escolhido: `localhost`

Critérios:
- Já era o valor padrão em todos os `.env` (`VITE_API_URL`, `VITE_PUBLIC_API_BASE_URL`,
  `CANDIDATE_PORTAL_PUBLIC_URL`)
- Backend `.env.example` documenta `localhost:5173` como primeira opção em `CORS_ORIGINS`
- `candidate-portal/.env.example` exige mesma regra (comentário "REGRA CRÍTICA DE HOST")
- Mais memorizável e consistente com ferramentas que padrão para localhost

---

## Mecanismo `resolveApiBaseUrl`

`frontend/src/services/http.ts` contém a função `resolveApiBaseUrl` que,
em modo `DEV`, espelha `window.location.hostname` na URL da API base:

```typescript
// Se browser abre localhost:5173 e VITE_API_BASE_URL=http://localhost:8000
//   → hostname bate → retorna http://localhost:8000        ✓

// Se browser abre 192.168.1.88:5173 (--network mode) e env=http://localhost:8000
//   → ambos são "local dev host" → substitui → http://192.168.1.88:8000  ✓

// Se browser abre 127.0.0.1:5173 (ERRADO) e env=http://localhost:8000
//   → substitui → http://127.0.0.1:8000  (API responde, mas sessão diverge)
```

O mecanismo garante que a API sempre responde mesmo se o host mudar, mas
**não elimina a divergência de localStorage/cookies** ao alternar origens.

---

## Correções aplicadas

### `scripts/dev-full.sh`
- `PUBLIC_HOST` em modo local alterado de `127.0.0.1` para `localhost`
- `VITE_API_URL` e `VITE_API_BASE_URL` injetados como `http://localhost:8000[/api/v1]`
- Seção "Pronto!" mostra somente `http://localhost:5173` como URL a abrir no browser
- Aviso explícito: "nao abrir 127.0.0.1:5173 no browser"

### `package.json` (raiz)
- Script `"frontend"`: default de `VITE_API_BASE_URL` alterado de `127.0.0.1` para `localhost`

### `frontend/.env`
- `VITE_API_BASE_URL=http://localhost:8000` adicionado explicitamente

### `frontend/.env.example`
- `VITE_API_BASE_URL` corrigido de `127.0.0.1:8000` para `localhost:8000`
- Comentário expandido com a regra de host canônico

---

## Regras de uso (resumo)

```
✓  USAR:   http://localhost:5173          (staff/admin frontend)
✓  USAR:   http://localhost:5174          (candidate portal)
✓  USAR:   http://localhost:8000          (backend / API)

✗  NÃO USAR: http://127.0.0.1:5173       (origem diferente → sessão e cache separados)
✗  NÃO USAR: http://127.0.0.1:5174
✗  NÃO USAR: http://127.0.0.1:8000       (ok para curl/healthcheck, não para browser)

LAN/network mode (npm run dev:full -- --network):
✓  USAR:   http://<SEU_IP_LAN>:5173      (único host exposto aos outros dispositivos)
✗  NÃO USAR: localhost enquanto outros dispositivos usam o IP
```

---

## O que NÃO muda

- Comportamento de produção: nenhuma alteração
- Regra de negócio: nenhuma alteração
- CORS do backend: mantém ambos `localhost` e `127.0.0.1` (ferramentas como curl usam 127.0.0.1)
- Vite proxy em `vite.config.ts`: target `127.0.0.1:8000` é correto (loopback interno, não afeta origin do browser)

---

## Validação

```bash
# Servidor saudável
npm run validate:vite-module-load
# → [ok] http://localhost:5173/src/pages/PipelinePage.tsx → 200 text/javascript

# Build limpo
cd frontend && npm run build
# → ✓ built in ~4s

# Playwright e2e
cd frontend && npx playwright test e2e/vite-module-load.spec.ts
# → PASS (1)
```

Abrir `http://localhost:5173/pipeline` no browser e confirmar:
- login funciona
- /pipeline carrega sem erro de MIME no console
- Network tab: PipelinePage.tsx retorna `text/javascript`
