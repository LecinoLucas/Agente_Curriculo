# components/ui/ — Shadcn UI Primitives

Base primitives estilo Shadcn UI. **Nenhuma lógica de negócio aqui.**

## O que vai neste diretório

- ✓ Shadcn UI components (button, input, card, badge, dialog, etc)
- ✓ Wrappers finos que só aplicam estilo Tailwind
- ✓ Primitivas reutilizáveis sem contexto de domínio

## O que NÃO vai aqui

- ✗ Lógica de negócio
- ✗ Estados complexos
- ✗ Chamadas de API
- ✗ Componentes específicos de domínio (Job, Candidate, etc)

## Exemplos de uso

```tsx
// ✓ OK: Primitiva pura
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ✓ OK: Composição em features/
import { Button } from "@/components/ui/button";

export function MyJobAction() {
  return <Button onClick={...}>Ação</Button>;
}
```

## Quando criar um novo componente aqui

Praticamente nunca. Shadcn já cobre os casos base.

Se o componente:
- Depende de tipos de domínio → use `features/*/components/`
- É uma abstração reutilizável genérica → use `shared/components/`
- É um wrapper thin de Shadcn → coloque aqui (se não existir)

## Guia completo

Veja `COMPONENTS.md` na raiz do projeto para padrões e árvore de decisão.
