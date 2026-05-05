# shared/components/ — Novo Padrão para Reutilizáveis

Componentes reutilizáveis entre features. **Sem lógica específica de domínio.**

## Estrutura

```
shared/components/
├── forms/                      ← Form utilities
│   └── Field.tsx               (label wrapper genérico)
├── layout/                     ← Container patterns
│   └── SectionCard.tsx         (form section container)
├── feedback/                   ← User feedback
│   └── MessageList.tsx         (message container)
└── data-display/               ← Data rendering
    ├── ReviewItem.tsx          (label + value pair)
    └── SummaryRow.tsx          (row display)
```

## Quando usar

### ✓ Coloque aqui se...

```tsx
// 1. Componente é genérico (não depends de Job, Candidate, etc)
export function Field({ label, children }) { ... }

// 2. Será usado por múltiplas features
// - JobFormPage usa SectionCard
// - CandidateFormPage (futura) pode usar também

// 3. É uma abstração ou wrapper de padrão visual
export function ReviewItem({ label, value }) { ... }
```

### ✗ NÃO coloque aqui se...

```tsx
// 1. Depende de tipos de domínio
// ✗ ERRADO:
// export function SkillSelector({ jobId, ...}) { ... }
// → Coloque em features/jobs/components/

// 2. Será usado apenas por uma feature
// ✗ ERRADO:
// export function JobQualityCard({ job }) { ... }
// → Coloque em features/jobs/components/
// → Mude para shared/ se outro feature o usar

// 3. Tem regras de negócio
// ✗ ERRADO:
// export function CandidateValidation({ candidate }) { ... }
// → Coloque em features/candidates/components/
```

## Exemplos reais do projeto

### ✓ Field (forms/)
```tsx
// Genérico, sem tipos de domínio
import { Field } from "@/shared/components/forms/Field";

// Usado por JobFormPage
<Field label="Título">
  <input type="text" />
</Field>

// Pode ser reutilizado por CandidateForm, etc
```

### ✓ SectionCard (layout/)
```tsx
// Genérico, é container de form section
import { SectionCard } from "@/shared/components/layout/SectionCard";

// Usado por JobFormMandatorySkillsStep
<SectionCard title="Skills" description="...">
  {children}
</SectionCard>

// Pode reutilizar em outras páginas que têm sections
```

### ✓ ReviewItem (data-display/)
```tsx
// Genérico, padrão label + value
import { ReviewItem } from "@/shared/components/data-display/ReviewItem";

// Usado por JobFormReviewStep
<ReviewItem label="Senioridade" value="Senior" />

// Pode reutilizar em CandidateReview, etc
```

### ✗ SkillSection (features/jobs/components/)
```tsx
// Específico de jobs, depende de JobSkill type
import { SkillSection } from "@/features/jobs/components/SkillSection";

// NÃO vai para shared/ porque:
// - Depende de JobSkill, JobFormValues types
// - Gerencia skills que são específicas de jobs
// - Seria estranho usar em Candidates (que têm skills diferentes)

// Se Candidates também precisar de SkillSection:
// ENTÃO refator para shared/components/
// (ou nome genérico: CompetencySection)
```

## Guia de decidir a categoria

```
Forms utilities?
  → shared/components/forms/
  
Container/Layout patterns?
  → shared/components/layout/
  
User feedback (errors, messages)?
  → shared/components/feedback/
  
Data display patterns (tables, lists)?
  → shared/components/data-display/
```

## Checklist: Antes de criar aqui

- [ ] Componente é genérico (sem tipos de domínio)?
- [ ] Será usado por 2+ features?
- [ ] Não tem dependência em services/api específicos?
- [ ] Está em categoria clara (forms, layout, feedback, data-display)?

Se todas forem sim → crie aqui. Caso contrário → crie em features/.

## Guia completo

Veja `COMPONENTS.md` na raiz do projeto para padrões e árvore de decisão.
