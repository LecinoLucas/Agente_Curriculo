# components/common/ — Legado Ativo

Padrão histórico de componentes reutilizáveis. **Não criar novos aqui.**

## O que está neste diretório

Componentes consolidados e em uso:

- ✓ PageHeader (10 imports) — Cabeçalho de páginas
- ✓ EmptyState (5 imports) — Estado vazio de listas
- ✓ StatusPill/StatusBadge (6 imports) — Status badges com tones
- ✓ ErrorAlert (3 imports) — Alertas de erro formatados
- ✓ Modal (3 imports) — Modal customizado
- ✓ Pagination (3 imports) — Paginação de listas
- ✓ Skeleton (2 imports) — Loading placeholders
- ✓ DataTable — Tabelas de dados
- ✓ CrudPage — Página CRUD completa
- ✓ Tabs, ActionMenu, ErrorBoundary, ToastContainer

## Regra de Ouro

```
Usar o que existe:      ✓ SIM
Criar novo aqui:        ✗ NÃO
Refatorar o existente:  ✓ Quando necessário
Migrar para shared:     ✓ No futuro (quando estável)
```

## Quando usar componentes deste diretório

```tsx
// ✓ OK: Usar o que existe
import { EmptyState } from "@/components/common/EmptyState";
import { StatusPill } from "@/components/common/StatusPill";
import { PageHeader } from "@/components/common/PageHeader";

// Composição
export function CandidatesPage() {
  return (
    <>
      <PageHeader title="Candidatos" />
      {isEmpty && <EmptyState title="Nenhum candidato" />}
    </>
  );
}
```

## Quando NÃO criar novo aqui

```tsx
// ✗ ERRADO: Criar novo componente em common/
// Crie em shared/components/ ou features/*/components/ em vez disso

// Por quê? Para:
// 1. Evitar duplicação com shared/
// 2. Manter common/ estável (legado)
// 3. Ter uma estratégia clara de onde vai novo código
```

## Migração para shared/components/

No futuro, componentes estáveis de `common/` podem ser migrados para `shared/` quando a organização estiver clara.

**Exemplo hipotético:**
```
StatusPill podia virar shared/components/feedback/StatusPill.tsx
PageHeader podia virar shared/components/layout/PageHeader.tsx
```

Mas isso só acontece quando decisões forem formalizadas.

## Guia completo

Veja `COMPONENTS.md` na raiz do projeto para padrões e árvore de decisão.
