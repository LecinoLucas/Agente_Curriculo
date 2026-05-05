# features/jobs/components/ — Componentes Específicos da Feature Jobs

Componentes que dependem de tipos, regras ou linguagem da feature Jobs.

## O que vai aqui

```tsx
// ✓ OK: Depende de types da feature
import { SkillSection } from "./SkillSection";
import type { JobSkill, PendingJobSkill } from "../../../types/domain";

export function SkillSection({
  mandatorySkills: (JobSkill | PendingJobSkill)[]
  availableSkills: Skill[]
  onAddSkill: (skill: Skill, isMandatory: boolean) => void
  ...
}) { ... }

// ✓ OK: Usa services da feature
import { skillsService } from "../../../services/skillsService";
export function SkillEditor({ jobId }: { jobId: string }) {
  const [skills, setSkills] = useState([]);
  useEffect(() => {
    skillsService.listJobSkills(jobId).then(setSkills);
  }, [jobId]);
}

// ✓ OK: Aplica regras de negócio de Jobs
export function MandatorySkillsValidator({
  skills,
  onError
}: { ... }) {
  if (skills.length < 2) {
    onError("Mínimo 2 skills obrigatórias");
  }
}
```

## O que NÃO vai aqui

```tsx
// ✗ ERRADO: Componente genérico sem tipos de domínio
// export function Field({ label, children }) { ... }
// → Coloque em shared/components/forms/

// ✗ ERRADO: Será usado por múltiplas features
// export function CompetencyBadge({ label, tone }) { ... }
// → Coloque em shared/components/ (é genérico)

// ✗ ERRADO: Não depende de tipos de job
// export function ErrorCard({ message }) { ... }
// → Coloque em components/common/ (ou shared/)
```

## Estrutura desta feature

```
features/jobs/
├── components/
│   └── SkillSection.tsx         ← Específico de jobs
├── sections/
│   ├── JobFormBasicStep.tsx     ← Steps do form
│   ├── JobFormRequirementsStep.tsx
│   ├── JobFormMandatorySkillsStep.tsx
│   ├── JobFormDifferentialsStep.tsx
│   ├── JobFormDealBreakersStep.tsx
│   └── JobFormReviewStep.tsx
├── hooks/
│   ├── useJobFormState.ts       ← Feature state management
│   ├── useJobSkills.ts
│   └── useJobPublication.ts
├── utils/
│   ├── jobFormHelpers.ts        ← Feature utilities
│   ├── dealBreakerHelpers.ts
│   ├── publicationState.ts
│   └── errorHelpers.ts
└── jobFormConfig.ts              ← Feature configuration
```

## Imports recomendados

### Dentro da feature (features/jobs/*)

```tsx
// ✓ OK: Importar de componentes/hooks/utils da mesma feature
import { SkillSection } from "../components/SkillSection";
import { useJobFormState } from "../hooks/useJobFormState";
import { toForm } from "../utils/jobFormHelpers";

// ✓ OK: Importar de shared/
import { SectionCard } from "@/shared/components/layout/SectionCard";
import { Field } from "@/shared/components/forms/Field";

// ✓ OK: Importar de components/ui/
import { Button } from "@/components/ui/button";

// ✓ OK: Importar de components/common/ (legado)
import { PageHeader } from "@/components/common/PageHeader";
```

### De outras features (features/candidates/*, pages/*)

```tsx
// ✓ OK: Importar de types de domínio
import type { Job, JobSkill } from "@/types/domain";

// ✓ OK: Importar de shared/ (padrões reutilizáveis)
import { SectionCard } from "@/shared/components/layout/SectionCard";

// ✗ EVITAR: Importar componentes da feature jobs
// import { SkillSection } from "@/features/jobs/components/SkillSection";
// ↑ Este é específico de jobs, não é genérico
```

## Quando mover para shared/

Se um componente desta feature for usado por outra:

```tsx
// Exemplo: Duas features usam o mesmo padrão de skills
// features/jobs/components/SkillSection.tsx (Job skills)
// features/candidates/components/SkillSection.tsx (Candidate skills)

// OPÇÃO 1: Refator para genérico
// → Mude para shared/components/feedback/CompetencySelector.tsx
// → Parameterize tipos e labels

// OPÇÃO 2: Reutilize direto
// features/candidates/ importa features/jobs/SkillSection
// → Só se o comportamento for idêntico

// OPÇÃO 3: Mantenha específico
// Se os comportamentos são diferentes, mantenha separado
```

## Guia completo

Veja `COMPONENTS.md` na raiz do projeto para padrões e árvore de decisão.
