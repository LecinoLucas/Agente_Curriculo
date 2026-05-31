# Information Architecture: Portal do Candidato — C1B

## Site Map

- Início `/` → redirect `/vagas`
- Vagas `/vagas`
  - Detalhe da vaga `/vagas/:slug`
    - Candidatura `/candidatar/:slug`
      - Confirmação `/sucesso`
- Login `/login`
- Área do candidato `/minha-area` (mock auth)
  - Avaliação `/avaliacao`
  - Pré-admissão `/pre-admissao`

## Navigation Model

- **Primary navigation (public)**: Logo (MarajóRH), Vagas, Área do Candidato (CTA)
- **Secondary navigation (autenticado)**: Nome do candidato + logout mock
- **Mobile navigation**: Menu hamburguer → drawer lateral com links principais
- **Breadcrumb**: páginas de detalhe e sub-fluxo (Vagas > [Título] > Candidatura)
- **Utility**: "Área do candidato" no header como CTA em todos os estados públicos

## Content Hierarchy

### `/vagas` — Lista de vagas
1. Search + filtros (área, modelo) — candidato chega querendo filtrar
2. Cards de vagas (título, empresa, localidade, modelo, área)
3. Paginação / load more

### `/vagas/:slug` — Detalhe da vaga
1. Título + empresa + localidade (hero)
2. CTA "Candidatar-se" — ação principal
3. Sobre a vaga / Responsabilidades / Requisitos / Benefícios
4. Sidebar: resumo (área, senioridade, modelo), etapas do processo

### `/candidatar/:slug` — Formulário de candidatura
1. Step indicator (Dados → Currículo → Revisão)
2. Campos do passo atual
3. Sidebar: resumo da vaga (contexto persistente)
4. Botões de navegação entre steps

### `/sucesso` — Confirmação
1. Mensagem de sucesso + próximos passos
2. CTA "Ir para minha área"

### `/login` — Login mock
1. Formulário email + senha
2. Contextualizar: "Acesse sua área do candidato"

### `/minha-area` — Dashboard
1. Boas-vindas + candidatura em andamento
2. Stepper horizontal do processo atual
3. "Próxima ação" com CTA
4. Mensagens do RH
5. Dados do perfil (completude)

### `/avaliacao` — Avaliação comportamental
1. Instrução + progresso (X de Y questões)
2. Questão atual (escala Likert)
3. Sidebar: resumo da vaga + andamento
4. Salvar / Finalizar

### `/pre-admissao` — Documentos
1. Progresso geral (X de Y documentos)
2. Lista de documentos com status e upload mock
3. Sidebar: próximos passos
4. CTA para avançar

## User Flows

### Fluxo principal: candidato novo
1. Acessa `/vagas` → vê lista de vagas
2. Clica em vaga → `/vagas/:slug`
3. Clica "Candidatar-se" → `/candidatar/:slug` (step 1: dados)
4. Preenche 3 steps → `/sucesso`
5. Clica "Minha área" → `/login`
6. Login mock → `/minha-area`

### Fluxo: avaliação comportamental
1. `/minha-area` → "Próxima ação: Responder avaliação"
2. `/avaliacao` → responde questões
3. Submete → volta a `/minha-area` com step avançado

### Fluxo: pré-admissão
1. `/minha-area` → "Próxima ação: Enviar documentos"
2. `/pre-admissao` → vê lista, faz upload mock
3. "Avançar" → volta a `/minha-area`

## Naming Conventions

| Conceito | Label no UI | Notas |
|---|---|---|
| Vaga de emprego | Vaga | Nunca "job", "posição" |
| Candidatar-se | Candidatar-se | CTA primário |
| Área privada | Área do candidato / Minha área | Não "dashboard", "portal" |
| Avaliação comportamental | Avaliação | Não expor "comportamental" no CTA |
| Pré-admissão | Pré-admissão | Seção de documentos |
| Upload | Enviar documento | Não "fazer upload" |
| Score/ranking | — | Nunca exibir |

## Component Reuse Map

| Componente | Páginas | Variação |
|---|---|---|
| `CandidatePortalLayout` | Todas | Prop `variant: "public" \| "authenticated"` |
| `PublicHeader` | Todas | Estado autenticado muda o CTA |
| `PublicFooter` | Todas | Fixo |
| `ProcessStepper` | `/minha-area`, `/avaliacao`, `/pre-admissao` | Horizontal e compacto |
| `StatusCard` | `/minha-area` | Vária por tipo de mensagem |
| `LoadingState` | Todas as páginas com fetch async | Skeleton ou spinner |

## URL Strategy

- Padrão: `/section/identifier` — kebab-case
- Slugs de vagas: `/:slug` — identificador único da vaga (ex: `frentista-rede-marajo`)
- Sem query params nesta fase (filtros são estado local no componente)
- Rotas autenticadas: sem prefixo diferente — mock auth via React context
