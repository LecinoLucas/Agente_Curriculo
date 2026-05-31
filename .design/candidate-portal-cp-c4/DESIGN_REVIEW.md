# Candidate Portal — Fase CP-C4: Auditoria técnica e design review

## O que foi e o que não foi feito

### Validação técnica executada

Os seguintes itens foram verificados por código e testes, com resultados reais:

| Verificação | Resultado | Método |
|---|---|---|
| Build de produção | ✅ Sucesso (< 2s) | `npm --prefix candidate-portal run build` |
| Testes unitários | ✅ 29/29 passaram | `npm --prefix candidate-portal test` |
| Links placeholder `href="#"` / `to="#"` | ✅ Zero encontrados | `grep -rn 'href="#"\|to="#"' src/` |
| `localStorage` / `sessionStorage` como fonte de verdade | ✅ Zero encontrados | `grep -rn 'localStorage\|sessionStorage' src/` |
| Deduplicação de requests `getOverview` | ✅ Verificada em teste | `overview-dedup.test.ts` (4 casos) |
| Polling de análise IA | ✅ Verificado em teste | `polling.test.ts` (25 casos) |
| Contrato de rotas e CTAs públicos | ✅ 78 assertions | `verify-public-contract.mjs` |
| Sessão por cookie HttpOnly | ✅ Verificado no código | `candidatePortalService.ts`, `App.tsx` |

### Validação visual — NÃO realizada

**Não há Playwright, Puppeteer, Cypress nem nenhum browser headless disponível neste ambiente.** Screenshots reais não foram capturados.

A fase CP-C4 anterior criou 7 arquivos `.png` de tamanho zero como placeholders. Esses arquivos foram removidos nesta correção (CP-C4-FIX). A lista abaixo documenta o que **seria** capturado num ambiente com browser real, mas **não foi**:

- `landing-desktop.png` — `/` em 1280px, usuário autenticado e não autenticado
- `landing-tablet.png` — `/` em 768px
- `landing-mobile.png` — `/` em 375px
- `login-mobile.png` — `/login` em 375px
- `minha-area-desktop.png` — `/minha-area` em 1280px, candidatura ativa
- `minha-area-tablet.png` — `/minha-area` em 768px
- `minha-area-mobile.png` — `/minha-area` em 375px

Para obter evidência visual real, execute localmente:
```bash
cd candidate-portal
npm run dev
# abrir http://localhost:5173 no navegador
```

Ou instale Playwright e crie testes E2E.

## Evidências que existem

- Build `dist/` gerado — não está versionado mas pode ser reproduzido com `npm run build`
- Saída de `npm test` (contrato + vitest): todos os testes passaram
- Código-fonte auditado manualmente — sem mocks falsos, sem dados inventados

## Bugs encontrados

Nenhum bug bloqueante encontrado na auditoria de código.

## Limitações declaradas

1. **Sem evidência visual**: nenhum screenshot real foi capturado. A validação é puramente técnica (testes, build, análise de código).
2. **Sem teste E2E de navegação**: fluxo completo de candidatura pública → /minha-area não foi executado em browser real neste ambiente.
3. **Flash do banner de sessão**: candidato autenticado vê brevemente o banner "Já tem cadastro?" antes da hidratação do App resolver (~100-200ms). Não é um bug, mas é perceptível.

## Melhorias futuras

- Adicionar Playwright ao `candidate-portal` para testes E2E automatizados com screenshots reais.
- Adicionar skeleton global no App enquanto a hidratação de sessão está em voo, eliminando o flash do banner.

---

### Confirmações explícitas

- [x] Arquivos fake removidos — não há `.png` vazio neste diretório
- [x] Não criei screenshot placeholder
- [x] Não declarei validação visual que não ocorreu
- [x] Não alterei backend
- [x] Não alterei staff/admin
- [x] Não alterei Pipeline
- [x] Não alterei RBAC
- [x] Não alterei regra de candidatura
- [x] Não fiz commit
- [x] Não fiz deploy
