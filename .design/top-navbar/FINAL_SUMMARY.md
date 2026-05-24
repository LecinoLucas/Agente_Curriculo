# Final Summary — TopNavbar e Temas

Data: 2026-05-24

## Estado Do Checkpoint

Este checkpoint consolida a migração da navegação lateral antiga para a TopNavbar horizontal e a reorganização dos temas visuais principais do Admissão RH.

## Navegação Atual

1. Dashboard é link compacto por ícone, com `aria-label="Dashboard"` e `title="Dashboard"`.
2. Pipeline é item direto principal, visível para roles permitidas.
3. Recrutamento é dropdown sem Pipeline.
4. Recrutamento contém:
   - Vagas
   - Candidatos
   - Agenda
5. Administração foi compactado para Adm na TopNavbar.
6. Dropdowns continuam respeitando estado ativo, `aria-expanded` e fechamento por Escape.
7. Drawer mobile foi preservado e respeita role/permissão.
8. A sidebar desktop antiga não faz parte do shell atual.

## Regras De Ativo

- `/dashboard` destaca Dashboard.
- `/pipeline` e `/pipeline/:jobId` destacam Pipeline direto.
- `/vagas`, `/vagas/nova` e `/vagas/:jobId/editar` destacam Recrutamento/Vagas.
- `/candidatos` e `/candidatos/:candidateId` destacam Recrutamento/Candidatos.
- `/agenda` destaca Recrutamento/Agenda.
- `/admin` e rotas filhas destacam Adm e o item filho correspondente.

## Permissões

- A navegação continua filtrada por role.
- `app_screens_config` continua participando da visibilidade dinâmica.
- Pipeline não é renderizado fora da lógica de grupos visíveis/permissões.
- Pipeline não aparece duplicado dentro de Recrutamento.
- `closeCandidate()` foi preservado ao navegar para Pipeline.

## Temas Atuais

- Tema 1: vermelho Marajó.
- Tema 2: azul industrial.
- `VisualThemeSwitcher` mostra apenas Tema 1 e Tema 2.
- `theme-3` e `theme-4` continuam suportados internamente para compatibilidade, mas não são expostos.
- Dark mode continua baseado em `data-theme="dark"` + `data-visual-theme`.
- `destructive`/erro permanece separado de `primary`.

## Validações Técnicas Registradas

- `npm run build`: passou.
- `npx tsc --noEmit`: passou.
- `npm run test -- AppShell.nav.test.tsx`: passou com cobertura da navegação.
- Testes de tema e autenticação relacionados passaram em fases anteriores.
- Smoke manual da TopNavbar aprovado.
- Smoke visual em 1280px validou ausência de overflow horizontal.
- Falha transitória de notificações em dev usa fallback mock e não gera erro novo de console.

## Rotas Principais Validadas

- `/dashboard`
- `/pipeline`
- `/pipeline/:jobId`
- `/candidatos`
- `/candidatos/:candidateId`
- `/vagas`
- `/vagas/nova`
- `/vagas/:jobId/editar`
- `/agenda`
- `/admin`
- `/admin/usuarios`
- `/admin/cadastros`
- `/admin/health`
- `/admin/bi`

## Backlog Opcional

1. Reduzir cores hardcoded restantes em KPIs, badges, status e fluxo público.
2. Criar tokens semânticos para status/métricas.
3. Revisar LoginPage para aderir melhor aos temas atuais.
4. Revisar fluxo público/candidato em uma fase visual própria.
5. Criar script seguro de limpeza de dados dev/E2E com dry-run.
6. Agrupar melhor utilidades da navbar se o uso real indicar excesso de botões.

## Veredito Final

Aprovado para checkpoint.

A TopNavbar horizontal e os dois temas principais estão alinhados ao estado atual do produto e podem ser considerados prontos para fechamento desta etapa.
