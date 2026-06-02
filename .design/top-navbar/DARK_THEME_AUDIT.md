# Auditoria Dark Theme

Data: 2026-06-02

## Escopo

Auditoria focada em coerência visual, contraste e aderência aos tokens no dark mode do shell/admin ATS.

Base usada nesta revisão:

- código atual do frontend
- screenshot existente em `.design/top-navbar/screenshots/review-dashboard-dark-desktop-1280.png`
- comparação com `.design/top-navbar/screenshots/review-dashboard-desktop-1280.png`

Observação:

- Não havia browser ativo anexado a esta thread no momento da auditoria, então a verificação visual foi feita com as capturas já salvas no repositório e com inspeção direta de código.

## Screenshot Inspecionada

- `.design/top-navbar/screenshots/review-dashboard-dark-desktop-1280.png`
- `.design/top-navbar/screenshots/review-dashboard-desktop-1280.png`

## Must Fix

1. O dark mode está sendo quebrado por superfícies e estados hardcoded em branco dentro do drawer/perfil de candidato. Isso cria placas claras artificiais no meio do tema escuro e faz o texto parecer “estourado” por contraste local excessivo.
   Arquivos principais:
   - `frontend/src/features/candidates/drawer/v2/CandidateDecisionPanel.tsx:246`
   - `frontend/src/features/candidates/drawer/v2/CandidateDecisionPanel.tsx:265`
   - `frontend/src/features/candidates/drawer/v2/CandidateDecisionPanel.tsx:280`
   - `frontend/src/features/candidates/drawer/v2/CandidateDecisionPanel.tsx:301`
   - `frontend/src/features/candidates/drawer/v2/CandidateProfileNavigation.tsx:98`
   - `frontend/src/features/candidates/drawer/components/CandidateHiringDecisionPanel.tsx:157`
   - `frontend/src/features/candidates/drawer/components/CandidateFinalDecisionSummaryCard.tsx:127`

2. Os fluxos de ação do drawer usam classes fixas de light mode (`bg-white`, `text-gray-700`, `bg-rose-50`, `bg-blue-600`) em vez de tokens. Isso gera botões, alertas e confirmações visualmente desconectados do dark mode e inconsistentes entre páginas.
   Arquivos principais:
   - `frontend/src/features/candidates/drawer/v2/CandidateQuickActions.tsx:69`
   - `frontend/src/features/candidates/drawer/v2/CandidateQuickActions.tsx:87`
   - `frontend/src/features/candidates/drawer/v2/CandidateQuickActions.tsx:102`
   - `frontend/src/features/candidates/drawer/v2/CandidateActionPanel.tsx:124`
   - `frontend/src/features/candidates/drawer/v2/CandidateActionPanel.tsx:151`
   - `frontend/src/features/candidates/drawer/v2/CandidateActionPanel.tsx:164`
   - `frontend/src/features/candidates/drawer/v2/CandidateQuickJobActions.tsx:104`
   - `frontend/src/features/candidates/drawer/v2/CandidateQuickJobActions.tsx:130`

3. O sistema de temas dark não está semanticamente alinhado com os temas light atuais. O caso mais claro é o `theme-4`: no light ele já foi migrado para “Creme Vibrante”, mas o dark continua com a identidade antiga “Gold Executive”. Isso faz a troca de tema parecer bug, não variação intencional.
   Arquivos:
   - `frontend/src/styles/index.css:624`
   - `frontend/src/styles/index.css:1000`
   - `frontend/src/styles/index.css:1793`

## Should Fix

1. O shell dark base está aceitável na screenshot, mas os tokens de destaque ainda estão saturados demais para texto/ativo contínuo em navegação. `theme-1` usa o mesmo vermelho forte para `--primary`, `--nav-active-bg`, `--sidebar-accent` e `--hero-start`, o que concentra muito peso cromático no mesmo ponto sem hierarquia suficiente.
   Arquivo:
   - `frontend/src/styles/index.css:730`
   - `frontend/src/styles/index.css:771`
   - `frontend/src/styles/index.css:775`
   - `frontend/src/styles/index.css:776`

2. A nomenclatura e descrição expostas no seletor ainda estão defasadas para pelo menos um tema ativo, o que dificulta auditar visualmente e aumenta a percepção de desorganização do sistema.
   Arquivo:
   - `frontend/src/components/layout/VisualThemeSwitcher.tsx:18`

3. O inventário de cores hardcoded no ecossistema do drawer é amplo demais para correção pontual isolada. Hoje o dark mode depende parcialmente de tokens no shell e parcialmente de classes semânticas fixas de Tailwind. Isso impede previsibilidade visual.
   Exemplos adicionais:
   - `frontend/src/features/candidates/drawer/components/CandidateBehavioralAssessmentPanel.tsx:15`
   - `frontend/src/features/candidates/drawer/components/BehavioralAIEvaluationPanel.tsx:136`
   - `frontend/src/features/candidates/drawer/components/PreAdmissionChecklist.tsx:102`
   - `frontend/src/features/candidates/drawer/components/CandidateDecisionSummaryCard.tsx:77`

## Could Improve

1. Padronizar tokens semânticos de status (`success`, `warning`, `info`, `danger`) e substituir o uso direto de `emerald`, `amber`, `blue`, `rose`, `gray`, `white`.
2. Definir versões dark próprias para superfícies translúcidas, em vez de reutilizar `bg-white/55`, `bg-white/70` e similares.
3. Revisar badges e chips para reduzir o brilho relativo em dark mode, principalmente onde o texto usa branco puro sobre fundos coloridos.

## Veredito

O dark mode não está “quebrado” no shell principal, mas está inconsistente no sistema como um todo. O problema dominante não é fonte em si; é a mistura entre tokens dark corretos e blocos inteiros ainda presos a classes claras hardcoded. Isso produz exatamente a sensação de interface destoada e cores estouradas.
