# Design Brief: LoginPage Redesign

## Problema

A `LoginPage` atual possui uma estética azul/slate genérica baseada em templates comuns de SaaS/IA. Isso gera uma desconexão com a identidade de marca da Marajó (que utiliza tons quentes de areia/palha, vermelho terroso e linhas institucionais elegantes). A interface atual, com cartões isolados flutuando sobre sombras pesadas e blocos azuis escuros frios, parece genérica e impessoal para um sistema estratégico de atração de talentos de alto nível.

## Solução

Redesenhar a `LoginPage` utilizando a estética **Brazilian Modernist / High-End Editorial**. O formulário e a seção informativa serão integrados de maneira contínua no fundo palha/areia quente (`--bg`), estruturados por um grid de linhas finas horizontais e verticais de espessura mínima, tipografia serifada monumental para títulos display e ornamentos gráficos autorais em SVG. A experiência passa a parecer uma publicação impressa premium ou um sistema institucional de arquitetura sofisticada.

## Experience Principles

1. **Estrutura contínua sobre cartões isolados** -- A tela se integra ao fundo natural palha/bege da aplicação. Em vez de uma caixa flutuante com sombra pesada (card), o formulário e o conteúdo dividem a tela através de linhas de demarcação finas e elegantes, gerando leveza e solidez visual.
2. **Tipografia monumental sobre decorações genéricas** -- O peso do design é carregado por uma fonte display elegante (serifada) com grande contraste de escala, eliminando elementos decorativos artificiais como ilustrações 3D ou orbes brilhantes genéricas de IA.
3. **Presença institucional autêntica** -- O vermelho Marajó (`--primary`) é usado de forma cirúrgica e controlada (como em botões de ação e estados de foco), mantendo o tom sóbrio e evitando que o login pareça uma página promocional ou uma tela corporativa antiga e pesada.

## Aesthetic Direction

- **Philosophy**: Brazilian Modernist / High-End Editorial (ver `/frontend-design` skill para referências de design limpo, linhas finas de divisão, espaços em branco e tipografia serif display).
- **Tone**: Profissional, premium, autoral, sóbrio, institucional.
- **Reference points**: Portfólios de arquitetura contemporânea brasileira, revistas de design de alta costura, publicações editoriais impressas premium.
- **Anti-references**: Landing pages coloridas de startups de IA, cartões com gradientes roxos/azuis neon, ilustrações corporativas 3D, portais congestionados de bancos antigos.

## Existing Patterns

O design deve respeitar os tokens principais definidos na aplicação no Tema 1:

- **Typography**: `Sora` (títulos) e `Plus Jakarta Sans` (corpo). Será importada a fonte `Instrument Serif` para títulos display principais da tela de login.
- **Colors**:
  - Geral: Fundo palha (`--bg`: `38 36% 94%` / `#FAF9F5`), Texto grafite quente (`--text`: `22 28% 12%` / `#261C14`).
  - Destaques: Vermelho Marajó (`--primary`: `356 76% 42%` / `#BA1A22`), Borda suave (`--border`: `35 22% 82%` / `#DCD5CC`).
- **Spacing**: Grid proporcional baseado em 4px/8px.
- **Components**: `Button` e `GoogleSignInButton`.

## Component Inventory

| Component | Status | Notes |
| --------- | ------ | ----- |
| `LoginPage.tsx` | Modify | Reestruturação completa do layout de colunas, tipografia e arranjo de elementos. |
| `LoginForm` (interno) | Modify | Integração direta no grid editorial, com inputs mais limpos e foco redesenhado. |
| `GoogleSignInButton` | Exists | Posicionamento estético refinado na base do formulário, sem alterações na sua lógica ou props. |
| Modernist SVG Graphic | New | Inclusão de um elemento gráfico SVG nativo (linhas de fluxo modernistas) na coluna esquerda. |

## Key Interactions

1. **Estado Idle (Ocioso)**: Fundo palha com linhas finas cinza-quente. Inputs integrados ao fundo com borda de 1px.
2. **Estado de Foco (Inputs)**: A borda sutil do campo muda para a cor primária (Vermelho Marajó) com uma transição suave de 150ms.
3. **Estado de Submissão (Loading)**: O botão "Entrar no painel" exibe texto "Entrando..." com opacidade reduzida e desabilita interações para evitar cliques duplos.
4. **Estado de Erro**: O banner de alerta de erro (`Alert` existente) é exibido com bordas finas vermelhas integradas ao formulário, mantendo o alinhamento do grid.
5. **Portal do Candidato**: Botão minimalista no topo superior direito com micro-animação de underline no hover.

## Responsive Behavior

- **Desktop (>= 1024px)**: Layout assimétrico de 2 colunas principais (60% esquerda / 40% direita) separadas por uma linha vertical fina. A coluna esquerda abriga o manifesto da marca, a tipografia serifada monumental e o elemento gráfico SVG. A direita abriga o login.
- **Tablet (768px - 1023px)**: Empilhamento vertical com padding generoso e manutenção do grid editorial.
- **Mobile (< 768px)**: Ocultação da coluna esquerda informativa. Foco de 100% da tela no formulário de login para rapidez de acesso. Tamanho da tipografia display reduzido para evitar quebras de linhas desproporcionais.

## Accessibility Requirements

- **Contraste**: Garantir contraste mínimo de 4.5:1 para todos os textos.
- **Teclado**: Preservar navegação sequencial lógica por Tab nos campos de entrada e botões.
- **Foco**: Manter contorno de foco visível e diferenciado em todos os elementos interativos.
- **Leitura**: Inputs com labels (`label` HTML nativo associados por `htmlFor` ou envolvendo o input).
- **Mobile**: Touch targets mínimos de 44px para botões e links.

## Out of Scope

- Alterações na lógica de autenticação do `AuthContext`, `authService` ou rotas.
- Mudanças estéticas em outras páginas além de `LoginPage.tsx`.
- Modificações na lógica de validação de e-mails Google ou na SDK do Google SignIn.
- Criação de fluxos de login adicionais (ex: login por telefone ou SMS).
