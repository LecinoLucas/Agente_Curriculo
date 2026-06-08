# HEADER REFINEMENT - FASE UI-PIPELINE-HEADER-1

## Objetivos da Refatoração (Abordagem Lighter Touch)
O objetivo principal foi resolver o aspecto "vazio" da tela do Pipeline após a recolha da sidebar, inserindo uma identidade de marca central e alocando os controles da vaga diretamente no header (portal), sem sobrecarregar a interface nem adicionar blocos pesados de cabeçalho.

## Modificações

### 1. `TopNavbar.tsx`
- **Manutenção de Leveza:** O componente foi mantido `bg-transparent` e `absolute`.
- **Branding Discreto:** Inserimos "MARAJÓ RH IA" no centro do header usando posicionamento absoluto (para não empurrar outros elementos) com uma tipografia discreta (`text-[11px] font-black uppercase opacity-60`).
- **Alvo do Portal:** Criamos um slot defensivo `<div id="header-actions-portal"></div>` ao lado direito dos botões de assistente e notificações. Ele usa `empty:hidden` e `hidden lg:flex` para não aparecer quando vazio ou em resoluções menores.

### 2. `PipelinePage.tsx`
- **Renderização Condicional e Portais:** A tela agora verifica dinamicamente se o contêiner `header-actions-portal` existe.
- **Fallback Automático (Defensivo):**
  - **Com Portal:** Renderiza os botões inline ocultos no desktop (`lg:hidden`) para manter acessibilidade no mobile, e projeta cópias funcionais no `TopNavbar` através do `createPortal`.
  - **Sem Portal:** Renderiza os botões inline em sua versão normal como fallback.
- **Labels Mantidas Intactas:** As etiquetas "Vincular candidato", "Ver Ranking IA" e "Atualizar" permanecem as mesmas.
- **Regras de Negócio Intactas:** Nenhuma mutação, chamada de API ou lógica de filtro/ordenamento foi alterada.

## Status dos Testes
- A suite do `PipelinePage` rodou integralmente passando por todos os 43 testes sem a necessidade de mocks agressivos da DOM, graças à técnica defensiva de Fallback.
- `AppShell.nav` validado, confirmando a estabilidade da topbar.
- A tipagem estática via `tsc` não reportou erros.

## Validação e Conformidade
Os testes passaram, e as labels permanecem consistentes. Não houve nenhuma quebra em rotinas críticas de vinculação, bloqueios de workflow ou atualização do ranking da IA.
