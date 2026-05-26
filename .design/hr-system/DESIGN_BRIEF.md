# Design Brief: Portal RH Marajó (Transição de Planilhas para Sistema)

## Problem

Atualmente, o time de Recursos Humanos gerencia os processos seletivos, banco de talentos e comunicação com candidatos através de múltiplas planilhas descentralizadas. Isso gera trabalho manual excessivo, perda de histórico, dificuldade na geração de relatórios e um tempo de resposta lento, prejudicando a experiência tanto do RH quanto dos candidatos.

## Solution

O **Portal RH Marajó** será uma plataforma centralizada e inteligente que substitui as planilhas por um fluxo de trabalho automatizado. Ele oferecerá gestão visual de ponta a ponta (kanban) para processos seletivos, banco de dados unificado de candidatos e comunicação integrada, permitindo ao time focar no lado humano e estratégico do recrutamento.

## Experience Principles

1. **Eficiência Visual sobre Dados Soltos** -- Abandonar linhas infinitas de planilhas em favor de cards visuais (kanban) e dashboards claros.
2. **Confiança sobre Velocidade** -- O sistema deve garantir que nenhum candidato seja esquecido e que todo o histórico de comunicação seja salvo e facilmente acessível.
3. **Familiaridade com a Marca** -- A interface deve respirar a identidade "Marajó RH" (premium, acolhedora e profissional), alinhada ao recém-desenhado Portal do Candidato.

## Aesthetic Direction

- **Philosophy**: Clean, corporativo moderno, focado em produtividade ("Productivity Zen").
- **Tone**: Profissional, organizado, acolhedor e eficiente.
- **Reference points**: Interfaces como Linear, Notion e modernos ATS (Applicant Tracking Systems) como o Ashby ou Greenhouse, mas com a paleta exclusiva Marajó RH.
- **Anti-references**: Sistemas legados cinzas (estilo anos 2000), planilhas complexas do Excel, interfaces desorganizadas com excesso de botões.

## Existing Patterns

- Typography: Fontes modernas, limpas (ex: Inter ou Roboto), mantendo consistência com o Portal do Candidato.
- Colors: Paleta Marajó RH (Tons de azul corporativo, branco, cinzas suaves e cores de acento para status).
- Spacing: Amplo e arejado.
- Components: Reutilização de padrões do Portal do Candidato (inputs, botões, modais).

## Component Inventory

| Component | Status | Notes |
| --------- | ------ | ----- |
| Kanban Board | New | Para visualização do funil de recrutamento |
| Data Table | New | Para listagem avançada de candidatos com filtros |
| Candidate Profile | New | Visão 360º do candidato (histórico, currículo) |
| Status Badge | Exists/Modify | Estendido para suportar múltiplos estados do RH |

## Key Interactions

- **Arrastar e Soltar (Drag & Drop)**: Mover candidatos entre as etapas do processo seletivo no Kanban.
- **Busca Global**: Encontrar rapidamente qualquer candidato ou vaga através de um atalho (ex: Cmd+K).
- **Filtros Avançados**: Filtrar listas instantaneamente sem recarregar a página.

## Responsive Behavior

O sistema será prioritariamente desktop, pois o time de RH realiza a maior parte do trabalho operacional em computadores. Telas de dashboard e listas devem se adaptar graciosamente a tablets, mas a otimização mobile não é o foco inicial da operação de backoffice.

## Accessibility Requirements

- Navegação por teclado funcional para tabelas e formulários.
- Alto contraste de texto.
- Feedback claro para ações destrutivas (ex: exclusão de vaga).

## Out of Scope

- Funcionalidades de folha de pagamento (payroll).
- Gestão de ponto e benefícios.
- (O foco inicial é 100% no Recrutamento e Seleção).
