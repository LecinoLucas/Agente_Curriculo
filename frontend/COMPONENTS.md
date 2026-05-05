# Guia de Componentes

Documentação oficial para organização de componentes no projeto.

## Estrutura de Diretórios

```
src/
├── components/
│   ├── ui/                     ← Shadcn primitives, sem lógica
│   ├── common/                 ← Componentes legados ativos
│   ├── [domain]/               ← Componentes específicos de domínio
│   └── layout/                 ← Estrutura da app (AppShell, etc)
├── shared/components/          ← Novos componentes reutilizáveis
│   ├── forms/
│   ├── layout/
│   ├── feedback/
│   └── data-display/
└── features/[feature]/
    └── components/             ← Componentes específicos da feature
```

---

## 1. components/ui/ — Base Primitives

**Propósito:** Componentes base sem lógica de negócio.

**O que vai aqui:**
- ✓ Shadcn UI primitives (button, input, card, badge, dialog, etc)
- ✓ Wrappers finos que só aplicam estilo
- ✓ Componentes low-level reutilizáveis

**O que NÃO vai aqui:**
- ✗ Lógica de negócio
- ✗ Estados complexos
- ✗ Chamadas de API
- ✗ Componentes específicos de domínio

**Exemplos:**
```tsx
// ✓ OK: Primitiva pura
import { Button } from "@/components/ui/button";

// ✓ OK: Wrapper fino de card
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// ✗ NÃO: Lógica de negócio
// NÃO coloque componentes que fazem fetch, transformam dados, etc
```

**Regra:** Nada em `components/ui/` deve saber sobre modelos de domínio (Job, Candidate, etc).

---

## 2. components/common/ — Legado Ativo

**Status:** Padrão histórico, ainda em uso. Não expandir novos aqui.

**O que está aqui:**
- ✓ PageHeader (10 imports)
- ✓ EmptyState (5 imports)
- ✓ StatusPill/StatusBadge (6 imports)
- ✓ ErrorAlert (3 imports)
- ✓ Modal (3 imports)
- ✓ Pagination, Tabs, DataTable, Skeleton, etc

**Regra de ouro:**
- Usar o que existe: sim
- Criar novo aqui: não
- Migrar para shared: sim (quando pronto)

**Próximos passos:**
- Componentes de common serão gradualmente migrados para shared quando atingirem estabilidade e clareza de padrão.

**Anti-pattern:**
```tsx
// ✗ NÃO FAÇA ISSO
// Criar novo componente em common é frowned upon
// Faça em shared/components/ em vez disso
```

---

## 3. shared/components/ — Novo Padrão para Reutilizáveis

**Propósito:** Componentes reutilizáveis entre features, sem lógica específica de domínio.

**O que vai aqui:**
- ✓ Componentes usados por 2+ features
- ✓ Componentes genéricos que não dependem de tipo específico (Job, Candidate)
- ✓ Padrões visuais reutilizáveis

**Estrutura interna:**
```
shared/components/
├── forms/                      ← Form utilities
│   └── Field.tsx               (label wrapper)
├── layout/                     ← Container patterns
│   └── SectionCard.tsx         (form section)
├── feedback/                   ← User feedback
│   └── MessageList.tsx         (message container)
└── data-display/               ← Data rendering
    ├── ReviewItem.tsx          (label + value)
    └── SummaryRow.tsx          (row display)
```

**Quando usar:**
```tsx
// ✓ Componente genérico, reutilizável
import { SectionCard } from "@/shared/components/layout/SectionCard";

// ✓ Abstração de label, para forms
import { Field } from "@/shared/components/forms/Field";

// ✗ NÃO: Componente específico de Job
// use em features/jobs/components em vez disso
```

**Regra:**
- Se o componente depende de tipos/regras de Job, Candidate, Pipeline → use `features/*/components`
- Se o componente é genérico e reutilizável → use `shared/components`

---

## 4. features/[feature]/components/ — Específico de Domínio

**Propósito:** Componentes que dependem da lógica, tipos ou linguagem de uma feature.

**O que vai aqui:**
- ✓ Componentes que usam tipos da feature (JobFormValues, Job, etc)
- ✓ Componentes que aplicam regras da feature
- ✓ Componentes que fazem chamadas a services da feature

**Exemplos:**
```tsx
// ✓ Específico de jobs: depende de types.domain (JobSkill, etc)
features/jobs/components/SkillSection.tsx

// ✓ Specific de jobs: form steps
features/jobs/sections/JobFormBasicStep.tsx

// ✓ Específico de candidates: depende de Candidate type
features/candidates/components/CandidateCard.tsx
```

**Regra:**
Se o componente faz sentido APENAS dentro de uma feature → fica aqui.

---

## 5. Anti-Patterns Proibidos

### ❌ 1. Criar novo em `components/common/`

```tsx
// PROIBIDO
// Não crie novos componentes em components/common/

// Em vez disso, use shared/components:
export function MyComponent() { ... }
// Coloque em: shared/components/feedback/MyComponent.tsx
// (ou forms, layout, data-display conforme apropriado)
```

### ❌ 2. Design system paralelo

```tsx
// PROIBIDO
// Não crie components/ui/ds/ ou outro design system

// Use Shadcn UI base em components/ui/
// Customize em components/common/ se necessário
// Abstração em shared/ se genérica
```

### ❌ 3. Duplicar componentes

```tsx
// PROIBIDO
// Não crie 3 versões de Card

// Padrão único:
// - components/ui/card.tsx: Shadcn base
// - shared/components/layout/SectionCard.tsx: Specialization if needed
// - features/*/components/MyCard.tsx: Domain-specific only

// Use o apropriado, não duplique
```

### ❌ 4. Jogar em shared "só porque pode reutilizar um dia"

```tsx
// PROIBIDO
// Esta é uma "feature" de JobForm, não compartilhada

// ✗ Não faça:
// shared/components/SkillSection.tsx (genérico demais, Job-specific)

// ✓ Faça:
// features/jobs/components/SkillSection.tsx (domínio-específico)

// Mude para shared APENAS quando outro feature usá-lo
```

### ❌ 5. Colocar lógica em components/ui/

```tsx
// PROIBIDO
// components/ui/ deve ser puro

// ✗ Não faça:
// components/ui/job-card.tsx com lógica de Job

// ✓ Faça:
// components/ui/card.tsx (primitiva pura)
// features/jobs/components/JobCard.tsx (com lógica)
```

---

## 6. Árvore de Decisão: Onde Colocar um Componente?

```
Novo componente? Pergunte:

1. É um Shadcn primitive puro (button, input, badge)?
   → components/ui/
   
2. É legado e já está em common?
   → Mantenha em components/common/
   
3. Depende de tipos/regras de uma feature específica?
   → features/[feature]/components/
   
4. É reutilizável entre features E genérico (sem tipos de domínio)?
   → shared/components/
       - Se é form utility → shared/components/forms/
       - Se é container → shared/components/layout/
       - Se é feedback → shared/components/feedback/
       - Se é data display → shared/components/data-display/
       
5. Dúvida? Coloque em features/[feature]/ primeiro.
   Mude para shared APENAS quando outro feature o usar.
```

---

## 7. Padrão de Imports

### Correto

```tsx
// ✓ Base primitives
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ✓ Common (legado ativo)
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";

// ✓ Shared (novo padrão)
import { SectionCard } from "@/shared/components/layout/SectionCard";
import { Field } from "@/shared/components/forms/Field";

// ✓ Feature-specific
import { SkillSection } from "@/features/jobs/components/SkillSection";
import { JobFormReviewStep } from "@/features/jobs/sections/JobFormReviewStep";
```

### Incorreto

```tsx
// ✗ Não importar de ds/ (removido)
import { Badge } from "@/components/ui/ds/Badge";

// ✗ Não importar StatusBadge direto (use StatusPill)
import { StatusBadge } from "@/components/common/StatusBadge";
// → StatusPill re-exports StatusBadge, use StatusPill

// ✗ Não criar novos em common/
// Crie em shared/ ou features/
```

---

## 8. Checklist: Antes de Criar um Novo Componente

- [ ] Existe algo similar em components/ui/?
  - Se sim, customize em casa (features/*/components/) em vez de criar novo
  
- [ ] Será usado por múltiplas features?
  - Se não, coloque em features/[feature]/components/
  - Se sim, coloque em shared/components/
  
- [ ] Depende de tipos/regras de domínio?
  - Se sim, coloque em features/[feature]/components/
  - Se não, shared/components/ está OK
  
- [ ] É um primitivo puro (sem lógica)?
  - Se sim, já deve estar em components/ui/ (como Shadcn)
  - Se não, não coloque aí
  
- [ ] É legado em components/common/?
  - Sim? Mantenha lá (considerar migração futura)
  - Não? Use o local apropriado acima

---

## 9. Exemplos Reais do Projeto

### ✓ Bem organizado

```
components/ui/button.tsx
→ Shadcn primitiva pura
→ Usado por: 21 imports

components/common/PageHeader.tsx
→ Legado ativo
→ Usado por: 10 imports

shared/components/forms/Field.tsx
→ Novo padrão: label wrapper genérico
→ Usado por: 3 imports (JobFormBasicStep, etc)

features/jobs/components/SkillSection.tsx
→ Feature-specific: gerencia skills, tipos Job
→ Usado por: 2 steps do JobForm

features/jobs/sections/JobFormBasicStep.tsx
→ Feature-specific: form step
→ Usado por: JobFormPage
```

### ✗ Anti-patterns removidos

```
components/ui/ds/* (REMOVIDO em Fase 3.1)
→ Design system paralelo, zero uso
→ Reason: Decided on Shadcn + common + shared

components/common/Card.tsx (REMOVIDO em Fase 3.1)
→ Wrapper nunca adotado
→ Reason: @/components/ui/card é o padrão
```

---

## 10. Contato / Dúvidas

Se não tem certeza sobre onde colocar um componente:

1. Use a árvore de decisão (seção 6)
2. Leia os exemplos (seção 9)
3. Quando em dúvida, coloque em `features/` e mova para `shared/` quando outro feature o usar
4. Pergunte no código review

---

**Última atualização:** 2026-05-05  
**Versão:** 1.0  
**Próximo review:** Quando migrar componentes de common/ para shared/
