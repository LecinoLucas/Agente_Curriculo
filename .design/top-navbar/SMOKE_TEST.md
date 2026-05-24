# Smoke Test - TopNavbar Horizontal

Data: 2026-05-24

## Ambiente Testado

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`
- Healthcheck backend: `{"status":"ok","database":{"connected":true}}`
- Banco usado pela aplicação local: `resume_ai`
- Viewports testados:
  - Desktop/admin overflow: `1280x900`
  - Desktop com VisualThemeSwitcher: `1600x900`
  - Mobile: `390x844`

## Usuários e Roles

- Admin: `admin@resume.ai`
- Recruiter: `r@teste.com`
- Manager: `luis@dev.com`
- Candidate: fora do escopo da TopNavbar. As rotas `/candidato`, `/candidato/login` e `/candidato/portal` ficam fora do `AppShell` e usam `CandidatePortalPage` separado.

Observação: o login real do admin foi validado via endpoint `/api/v1/auth/login` com resposta `200 OK`. Para evitar rate limit local após tentativas repetidas, as checagens visuais por role foram feitas com token dev assinado e usuário real do banco.

## Hierarquia Atual Validada

1. Dashboard é link compacto por ícone, com `aria-label="Dashboard"` e `title="Dashboard"`.
2. Pipeline é item direto principal da TopNavbar.
3. Recrutamento é dropdown e contém apenas:
   - Vagas
   - Candidatos
   - Agenda
4. Avaliações, Gestores, IA & Automação e Adm continuam como grupos conforme role/permissão.
5. Adm é o rótulo compacto exibido para o antigo grupo Administração.
6. O drawer mobile preserva navegação equivalente e respeita role/permissão.

## Rotas Testadas

| Rota | Resultado | Observações |
| --- | --- | --- |
| `/dashboard` | Passou | TopNavbar visível, Dashboard compacto ativo, sem sidebar desktop antiga, sem scroll horizontal. |
| `/pipeline` | Passou | Pipeline aparece como item direto e fica ativo. |
| `/pipeline/d53b04a9-6a64-48cc-a27e-a621152b537b` | Passou | Rota filha destaca Pipeline direto corretamente. |
| `/candidatos` | Passou | Recrutamento ativo; item Candidatos ativo no dropdown. |
| `/candidatos/5e8bd392-a5d5-4820-974d-0f358f8c9abf` | Passou | Rota filha destaca Recrutamento/Candidatos corretamente. |
| `/vagas` | Passou | Recrutamento ativo; item Vagas ativo no dropdown. |
| `/vagas/nova` | Passou | Rota filha destaca Recrutamento/Vagas corretamente. Há um `<aside>` próprio do painel de qualidade da página, não a sidebar antiga. |
| `/vagas/d53b04a9-6a64-48cc-a27e-a621152b537b/editar` | Passou | Rota filha destaca Recrutamento/Vagas corretamente. Há um `<aside>` próprio do painel de qualidade da página, não a sidebar antiga. |
| `/agenda` | Passou | Recrutamento ativo; item Agenda ativo no dropdown. |
| `/admin` | Passou | Adm ativo; item Admin ativo no dropdown. |
| `/admin/usuarios` | Passou | Adm ativo; item Usuários ativo no dropdown. |
| `/admin/cadastros` | Passou | Adm ativo; item Cadastros ativo no dropdown. |
| `/admin/health` | Passou | Adm ativo; item Saúde do sistema ativo no dropdown. |
| `/admin/bi` | Passou | Adm ativo; item BI ativo no dropdown. |

## Validações Visuais

- TopNavbar aparece nas rotas internas testadas.
- Sidebar desktop antiga não aparece.
- Conteúdo ocupa largura correta: `mainLeft=0`, `mainWidth=1280`, `headerWidth=1280` em desktop 1280px.
- Não há espaço lateral fantasma.
- Não há scroll horizontal no body/documento nas rotas testadas.
- Dashboard não compete visualmente com Pipeline.
- Pipeline é o item operacional principal visível.
- Rota ativa fica destacada com `aria-current="page"`.
- Rotas filhas destacam o item pai correto no dropdown.
- Dropdowns abrem e fecham com Escape.
- Dropdowns usam `z-index: 50`, acima do conteúdo comum.
- `NotificationsBell` aparece e não quebra layout.
- Toggle claro/escuro aparece e alterna tema.
- Perfil e Sair aparecem como ações diretas na TopNavbar.
- Acesso a Trocar senha continua disponível via Perfil > Alterar senha.
- `VisualThemeSwitcher` aparece em desktop largo (`1600px`). Em `1280px`, fica oculto para preservar a legibilidade da navegação principal.
- Não houve overflow visual em `1280px` com admin.

## Validações Mobile

- Em `390px`, a navegação desktop não aparece.
- Hamburger aparece.
- Drawer mobile abre.
- Drawer mobile fecha com Escape.
- Drawer mobile fecha pelo backdrop.
- Link Pipeline no drawer navega corretamente para `/pipeline`.
- Drawer respeita role/permissão: no admin, os grupos permitidos aparecem no drawer, incluindo Adm.
- Não aparece sidebar desktop antiga em mobile.

## Validações Por Role

| Role | Resultado | Grupos visíveis |
| --- | --- | --- |
| admin | Passou | Dashboard compacto, Pipeline, Recrutamento, Avaliações, Gestores, IA & Automação, Adm |
| recruiter | Passou | Dashboard compacto, Pipeline, Recrutamento, Avaliações, IA & Automação |
| manager | Passou | Dashboard compacto, Pipeline, Recrutamento, Gestores |
| candidate | Fora do escopo | Fluxo de candidato não passa pelo `AppShell`. |

## Temas

- Tema 1: vermelho Marajó.
- Tema 2: azul industrial.
- `theme-3` e `theme-4` continuam suportados internamente para compatibilidade, mas não são expostos no `VisualThemeSwitcher`.
- `VisualThemeSwitcher` exibe apenas Tema 1 e Tema 2.
- Light e dark foram validados nas rotas principais, com checagem específica em `/pipeline`, `/candidatos` e `/admin`.

## Console

- Nenhum erro novo de console foi capturado durante as rotas desktop testadas.
- Nenhum erro novo de console foi capturado durante o smoke mobile.
- Falhas transitórias de notificações em dev usam fallback mock e não poluem o console como erro crítico.

## Bugs Encontrados

Nenhum bug bloqueante encontrado na TopNavbar horizontal.

Observações não bloqueantes:

- `/vagas/nova` e `/vagas/:jobId/editar` possuem um `<aside>` próprio do painel de qualidade da página. Isso não é a sidebar desktop antiga e não gera offset lateral fantasma.
- `VisualThemeSwitcher` não aparece em `1280px` por decisão técnica de overflow; aparece em `1600px`. O toggle claro/escuro permanece acessível em `1280px`.

## Pendências Reais

Nenhuma pendência real encontrada para T13.

## Conclusão Final

Aprovado.

A migração da TopNavbar horizontal pode ser considerada concluída no escopo T9-T13 e nas fases posteriores de ajuste visual.
