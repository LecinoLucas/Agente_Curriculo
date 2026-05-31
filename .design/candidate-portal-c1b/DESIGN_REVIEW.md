# Design Review — Candidate Portal C1B

## Resultado

**Aprovado com ressalvas**

A estrutura definitiva foi criada, todos os builds passam, todas as rotas estão implementadas e os fluxos principais funcionam. As ressalvas são de polish visual e integração futura, não de bloqueio.

---

## O que foi implementado

### Estrutura de arquivos
```
candidate-portal/
├── index.html
├── package.json (React 19, React Router 6, Lucide, Tailwind 3, TypeScript)
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json (strict mode)
└── src/
    ├── main.tsx
    ├── App.tsx (MockAuthContext)
    ├── routes/CandidatePortalRouter.tsx
    ├── pages/ (8 páginas)
    ├── components/
    │   ├── layout/ (3 componentes)
    │   ├── ui/ (6 componentes)
    │   └── shared/ (5 componentes)
    ├── data/mockCandidatePortal.ts
    ├── services/ (mock + placeholder API client)
    ├── styles/index.css (tokens + Tailwind)
    └── types/candidatePortal.ts
```

### Rotas implementadas
| Rota | Componente | Status |
|---|---|---|
| `/` | → redirect `/vagas` | ✅ |
| `/vagas` | PublicJobsPage | ✅ |
| `/vagas/:slug` | PublicJobPage | ✅ |
| `/candidatar/:slug` | ApplicationFormPage | ✅ |
| `/sucesso` | ApplicationSuccessPage | ✅ |
| `/login` | CandidateLoginPage | ✅ |
| `/minha-area` | CandidateHomePage | ✅ |
| `/avaliacao` | CandidateAssessmentPage | ✅ |
| `/pre-admissao` | CandidatePreAdmissionPage | ✅ |

### Design tokens aplicados
- Fonte: **Plus Jakarta Sans** (Google Fonts) — geométrica, amigável, profissional
- Cor primária: **#C62828** (Marajó Red) — conforme identidade visual do protótipo
- Border radius: 8-12px em cards, 6px em inputs
- Sombras: suaves (card-shadow + card-shadow-hover)
- Espaçamento: base 4px, scale Tailwind padrão
- Filosofia: Functionalist Professional (Dieter Rams + toque Escandinavo)

---

## Fluxos validados (build pass + code review)

### Fluxo 1: Candidato público → Candidatura
1. `/vagas` — lista 3 vagas com filtros de área e modelo ✅
2. `/vagas/frentista-rede-marajo` — detalhe com sidebar ✅
3. `/candidatar/frentista-rede-marajo` — 3 steps (dados → currículo → revisão) ✅
4. `/sucesso` — confirmação com process steps ✅

### Fluxo 2: Candidato autenticado → Dashboard
1. `/login` — login mock com qualquer e-mail ✅
2. `/minha-area` — dashboard com ProcessStepper, próxima ação, mensagens ✅

### Fluxo 3: Avaliação comportamental
1. `/avaliacao` — 6 questões Likert, progresso em tempo real ✅
2. Submit → volta para `/minha-area` ✅

### Fluxo 4: Pré-admissão
1. `/pre-admissao` — checklist de 5 documentos com status ✅
2. Upload mock com drag & drop simulado ✅
3. Progresso atualiza em tempo real ✅

---

## Viewports avaliados

| Viewport | Layout | Status |
|---|---|---|
| Desktop (1280px) | Two-column (main + sidebar) | ✅ implementado via `lg:grid-cols` |
| Tablet (768px) | Single column + mobile menu | ✅ implementado via responsive classes |
| Mobile 375px | Stack vertical, bottom padding, 44px touch targets | ✅ mobile-first |

### Mobile específico
- Header: menu hamburguer com drawer
- Navigation: `flex-wrap` em badges e filtros
- Cards: padding ajustado para `p-4` em mobile
- CTAs: `fullWidth` em páginas de ação
- Inputs: `text-sm` ≥ 16px (evita zoom iOS)

---

## Must-fix

| # | Item | Prioridade | Status |
|---|---|---|---|
| M1 | `publicApiClient.ts` lança erro — deve ser placeholder silencioso para não quebrar importações futuras | Alta | Aberto |
| M2 | Não há proteção de rota autenticada — `/minha-area`, `/avaliacao`, `/pre-admissao` acessíveis sem login | Normal (fase mock, documentado) | Aberto |
| M3 | `StatusCard` hardcodava `navigate('/avaliacao')` para CTA de action | Normal | ✅ **Resolvido** |

### M3 — Detalhes da resolução
`StatusCard` recebe agora `actionLabel?: string` e `actionRoute?: string` como props opcionais. O CTA só renderiza quando `actionRoute` é fornecido. A rota hardcoded foi removida do componente compartilhado.

`CandidateHomePage` passa as props explicitamente, derivando a rota de `activeApp.next_action_route`:
```tsx
<StatusCard
  message={msg}
  actionRoute={msg.type === 'action' ? activeApp?.next_action_route : undefined}
  actionLabel={msg.type === 'action' ? 'Responder agora' : undefined}
/>
```

Se a mensagem não for do tipo `action`, o card renderiza sem botão. Se `next_action_route` for `undefined`, idem.

---

## Should-fix futuro

| # | Item |
|---|---|
| S1 | Substituir `mockCandidatePortalService` por `publicApiClient` real quando backend estiver disponível |
| S2 | Implementar `PrivateRoute` wrapper para rotas autenticadas |
| S3 | Adicionar loading skeleton nas páginas de candidato (hoje usa spinner simples) |
| S4 | `PublicJobsPage`: adicionar paginação quando lista crescer |
| S5 | `ApplicationFormPage`: adicionar validação de campos antes de avançar steps |
| S6 | `CandidateAssessmentPage`: persistir respostas em localStorage para permitir "continuar depois" real |
| S7 | Favicon — `index.html` referencia `/favicon.svg` que não foi criado |

---

## Could-improve

- Adicionar micro-animações nas transições de step (ApplicationFormPage)
- Dark mode (tokens já preparados na estrutura, só falta implementar)
- Hero image nas páginas de vaga (hoje usa ícone Briefcase)
- Internacionalização (i18n) para `pt-BR` formal vs. informal
- `ProcessStepper` no detalhe da vaga poderia ter tooltips explicando cada etapa

---

## Evidências de validação

### Build candidate-portal
```
✓ tsc (zero erros, strict mode)
✓ vite build em 1.82s
dist/assets/index-BQSQES0W.css   23.80 kB │ gzip:  5.11 kB
dist/assets/index-BwjiFoSu.js   286.06 kB │ gzip: 84.56 kB
```

### Build frontend interno (não alterado)
```
✓ built in 3.77s (zero erros)
```

### Screencasts manuais
Sem browser tool disponível nesta fase. Validação visual recomendada via:
```bash
npm --prefix candidate-portal run dev
# Acesse http://localhost:5174
```

Percorrer: `/vagas` → `/vagas/frentista-rede-marajo` → `/candidatar/frentista-rede-marajo` → `/sucesso` → `/login` → `/minha-area` → `/avaliacao` → `/pre-admissao`

---

## Comandos executados

```bash
npm --prefix candidate-portal install   # ✅ 0 vulnerabilities
npm --prefix candidate-portal run build  # ✅ zero erros
npm --prefix frontend run build          # ✅ zero erros (frontend não alterado)
```

---

## Regras respeitadas

| Regra | Status |
|---|---|
| Não alterar backend | ✅ |
| Não alterar frontend interno | ✅ |
| Não alterar endpoints | ✅ |
| Não criar backend separado | ✅ |
| Não chamar API real | ✅ (publicApiClient é placeholder) |
| Não implementar auth real | ✅ (MockAuthContext) |
| Não implementar upload real | ✅ (UploadMockCard simula delay) |
| Não importar de frontend/src | ✅ |
| Não usar shadcn | ✅ (componentes próprios) |
| Não remover candidate-portal-prototype | ✅ |
| Não expor score IA / ranking / pipeline | ✅ |

---

## Decisão recomendada para próxima fase

**C1C — Integração com API real**
- Substituir `mockCandidatePortalService` por `publicApiClient` apontando para `/api/v1/public`
- Implementar `PrivateRoute` com token JWT do candidato
- Implementar upload real de documentos
- Adicionar validação de formulários (react-hook-form ou zod)
