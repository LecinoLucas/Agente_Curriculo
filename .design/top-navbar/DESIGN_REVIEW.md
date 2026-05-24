# Design Review — TopNavbar horizontal

Data: 2026-05-24

## Escopo Revisado

Revisão visual e de experiência da TopNavbar horizontal nas rotas:

- `/dashboard`
- `/pipeline`
- `/candidatos`
- `/vagas`
- `/vagas/nova`
- `/admin`

Base da análise:

- implementação atual do frontend
- screenshots capturadas localmente
- [SMOKE_TEST.md](./SMOKE_TEST.md)

Observação: `.design/top-navbar/DESIGN_BRIEF.md` e `.design/top-navbar/TASKS.md` não estavam presentes neste diretório no momento da revisão. A avaliação foi feita sobre a interface implementada e a documentação de smoke test disponível.

## Ambiente Observado

- Frontend local em `http://127.0.0.1:5173`
- Backend local em `http://127.0.0.1:8000`
- Largura principal inspecionada: `1280px`
- Validação complementar:
  - desktop dark mode
  - dropdown aberto
  - mobile `375px`/`390px`

## Estado Atual Da Navegação

1. Dashboard é link compacto por ícone, com `aria-label="Dashboard"` e `title="Dashboard"`.
2. Pipeline é item direto principal e fica ativo em `/pipeline` e `/pipeline/:jobId`.
3. Recrutamento continua como dropdown, mas sem Pipeline.
4. Recrutamento contém Vagas, Candidatos e Agenda.
5. Rotas de vagas destacam Recrutamento/Vagas:
   - `/vagas`
   - `/vagas/nova`
   - `/vagas/:jobId/editar`
6. Rotas de candidatos destacam Recrutamento/Candidatos:
   - `/candidatos`
   - `/candidatos/:candidateId`
7. `/agenda` destaca Recrutamento/Agenda.
8. Administração foi compactado para Adm na TopNavbar.

## Screenshots Capturadas

- `screenshots/review-dashboard-desktop-1280.png`
- `screenshots/review-pipeline-desktop-1280.png`
- `screenshots/review-candidatos-desktop-1280.png`
- `screenshots/review-vagas-desktop-1280.png`
- `screenshots/review-vagas-nova-desktop-1280.png`
- `screenshots/review-admin-desktop-1280.png`
- `screenshots/review-dashboard-dropdown-desktop-1280.png`
- `screenshots/review-dashboard-dark-desktop-1280.png`
- `screenshots/review-dashboard-mobile-375.png`
- `screenshots/review-dashboard-mobile-drawer-375.png`
- `screenshots/navbar-polish/pipeline-1280.png`
- `screenshots/navbar-polish/adm-dropdown-1280.png`

## Pontos Aprovados

1. A TopNavbar melhora a leitura global do ATS em comparação com a antiga ocupação lateral. O conteúdo principal ganhou largura útil e o fluxo das páginas ficou mais direto.
2. A hierarquia atual prioriza o trabalho operacional: Pipeline está direto e visível.
3. Dashboard ficou acessível sem ocupar espaço textual excessivo.
4. A hierarquia visual está clara. Marca à esquerda, navegação ao centro e utilidades à direita formam uma estrutura previsível e profissional.
5. O estado ativo está evidente sem exagero. O destaque atual funciona bem e não compete com o conteúdo das páginas.
6. Os dropdowns são claros e fáceis de entender. Título, descrição curta e espaçamento estão adequados.
7. A identidade Marajó aparece de forma equilibrada. O branding existe, mas não transforma a navbar em peça promocional.
8. O rótulo Adm reduz compressão visual sem esconder acesso administrativo.
9. O ajuste de `1280px` resolveu a legibilidade dos rótulos principais permitidos.
10. Mobile está usável. A navegação não tenta comprimir todos os links no topo e o drawer mantém a experiência coerente.

## Problemas Encontrados

Nenhum problema bloqueante restante para a TopNavbar.

Problemas anteriores resolvidos:

- Truncamento dos rótulos principais em `1280px`.
- Pipeline escondido dentro do dropdown Recrutamento.
- Dashboard competindo como item textual direto.
- Rótulo Administração longo demais para a densidade da navbar admin.

## Ajustes Opcionais

1. Reduzir futuramente a fragmentação visual do bloco de utilidades desktop, desde que isso não altere o comportamento atual.
2. Reavaliar uma alternativa discreta ao `VisualThemeSwitcher` oculto em `1280px`, apenas se houver demanda real de uso frequente.
3. Revisar microcopy e labels de grupos depois de uso real com admin/recruiter/manager.

## Veredito

**Aprovado**

A migração para a TopNavbar horizontal está concluída no escopo visual e estrutural atual. A navegação prioriza Pipeline, mantém Dashboard acessível, preserva permissões por role/app_screens_config, mantém drawer mobile e não reintroduz a sidebar antiga.

## Backlog Não Bloqueante

- Agrupar melhor as utilidades da navbar em uma fase futura.
- Revisar posicionamento do seletor visual de tema em telas entre `1280px` e `1400px`.
- Continuar removendo cores hardcoded em páginas internas para aumentar consistência dos temas.
