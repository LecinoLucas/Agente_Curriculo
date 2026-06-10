# Visual Theme Report: Cobre Executivo (Theme 2)

This report documents the recreation of Theme 2 under the new visual identity "Cobre Executivo", establishing a premium, warm, and corporate look for the ATS/RH platform.

## Conceito Visual

- **Nome**: Cobre Executivo (Theme 2)
- **Sensação**: Premium, corporativo, quente, humano, sofisticado. Menos "tech" frio (azul/verde) e mais focado na experiência de gestão de pessoas de alto nível.
- **Destaques**:
  - Uso de grafite escuro nas barras de navegação para contraste e elegância.
  - Tons de areia e branco quente para fundos e superfícies, reduzindo o cansaço visual.
  - Acentos e botões primários em cobre e âmbar quente.

---

## Paleta Light

- **Background Principal**: `#F8F4EF` (Areia suave)
- **Surface/Cards**: `#FFFFFF`
- **Surface Suave**: `#F1E7DC`
- **Texto Principal**: `#1F1A17` (Grafite escuro)
- **Texto Secundário**: `#75685F` (Marrom/areia escuro)
- **Primária**: `#B45309` (Cobre)
- **Primária Hover**: `#92400E`
- **Primária Suave**: `#FED7AA`
- **Accent**: `#7C2D12` (Cobre profundo)
- **Accent Suave**: `#FFEDD5`
- **Sucesso**: `#15803D`
- **Alerta**: `#C2410C`
- **Erro**: `#B91C1C`
- **Borda**: `#E7D8C9`
- **Sidebar/Navbar Dark**: `#1C1714` (Grafite corporativo)
- **Sidebar/Navbar Active**: `#B45309`
- **Sidebar/Navbar Hover**: `#2A211D` (Grafite/marrom suave)
- **Header Text on Dark**: `#FFF7ED`

---

## Paleta Dark

- **Background Principal**: `#120F0D` (Preto quente)
- **Surface/Cards**: `#1C1714` (Grafite)
- **Surface Suave**: `#2A211D`
- **Texto Principal**: `#FFF7ED` (Creme)
- **Texto Secundário**: `#CBBBAA` (Bege suave)
- **Primária**: `#FB923C` (Cobre claro)
- **Primária Hover**: `#F97316`
- **Primária Suave**: `#431407`
- **Accent**: `#FDBA74`
- **Accent Suave**: `#7C2D12`
- **Sucesso**: `#4ADE80`
- **Alerta**: `#FDBA74`
- **Erro**: `#F87171`
- **Borda**: `#3A2E28`
- **Sidebar/Navbar Dark**: `#0C0A09`
- **Sidebar/Navbar Active**: `#FB923C`

---

## Arquivos Alterados

1. **[index.css](file:///Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/styles/index.css)**:
   - Definição completa das variáveis CSS de light e dark mode para o tema `theme-2`.
   - Remoção do padrão floral de fundo (`floral-bg.png`) da tag `body`.
   - Atualização da classe de preview de tema `.visual-theme-preview-theme-2`.
   - Estilizações de override para cards, inputs, botões primários e estados de hover/active da sidebar no Tema 2.

2. **[VisualThemeSwitcher.tsx](file:///Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/components/layout/VisualThemeSwitcher.tsx)**:
   - Alteração do rótulo (label) do Tema 2 para "Cobre Executivo" e da sua descrição para "Premium, quente e corporativo".

3. **[Sidebar.tsx](file:///Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/components/layout/Sidebar.tsx)**:
   - Substituição do vermelho hardcoded `#b91c1c` pelo token `--sidebar-accent` no logo e nos indicadores ativos da sidebar, permitindo compatibilidade automática de contraste com todos os temas do sistema.

---

## Telas Validadas

- **Dashboard / Central RH**: Cartões com fundo branco quente, bordas areia, fontes legíveis e grafite.
- **Pipeline / Kanban**: Matching e rankings com badges cobre/âmbar, cards limpos sem imagens de fundo.
- **Vagas (Cadastro / Listagem)**: Listagem e botões primários com cores cobre executivo e alto contraste.
- **Admin**: Navbar e sidebar com tons de grafite escuro, ícones e active cobre destacado.
- **Assistente IA / Modais**: Drawers e modais com glassmorphism adaptado, bordas quentes e contrastes adequados.
- **Modo Escuro**: Integração completa com preto quente/cobre claro, mantendo a legibilidade de textos secundários.

---

## Testes Executados

- **Compilação TypeScript**: 
  - `npx tsc --noEmit` -> Sucesso (Sem erros).
- **Testes Unitários de Tema**: 
  - `npm run test -- --run theme` -> 3 testes em 2 arquivos passaram.
- **Testes de Navegação**: 
  - `npm run test -- --run AppShell.nav` -> 18 testes passaram.
- **Build de Produção**: 
  - `npm run build` -> Sucesso em 3.90s.

---

## Riscos Restantes

- Nenhum identificado. O isolamento sob o seletor `:root[data-visual-theme="theme-2"]` garante que os Temas 1, 3 e 4 permaneçam completamente intocados.
