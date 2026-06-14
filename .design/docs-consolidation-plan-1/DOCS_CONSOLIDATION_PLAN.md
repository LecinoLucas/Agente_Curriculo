# DOCS-CONSOLIDATION-PLAN-1: Documentation Consolidation Plan

## 1. Sumário Executivo
Este documento apresenta um plano para a consolidação e organização da documentação do repositório. Atualmente, a documentação encontra-se dispersa entre a raiz, pastas `docs/`, `workflows/` e `.design/`. O plano propõe uma estrutura canônica baseada em domínios técnicos e funcionais, movendo documentos que representam "fontes da verdade" para pastas específicas e mantendo relatórios de execução e auditorias históricas na pasta `.design/`.

## 2. Estrutura Atual dos Docs
- **Raiz (`./`)**: Contém documentos técnicos mistos, guias de desenvolvimento Protheus e READMEs.
- **`docs/`**: Contém glosários, guias de deploy e uma subpasta `implementation/` com auditorias, decisões, fases e prompts.
- **`workflows/`**: Contém fluxos de trabalho de arquitetura, mapas de páginas e fluxos de design de IA.
- **`.design/`**: Contém relatórios detalhados de dezenas de fases de desenvolvimento, alguns dos quais contêm definições de arquitetura e produto que deveriam ser centralizadas.

## 3. Problemas Encontrados
1. **Dispersão**: Informações de arquitetura estão espalhadas por `documentacao.md`, `workflows/PROJECT_WORKFLOW.md` e vários ADRs em `.design/`.
2. **Duplicação**: `CLAUDE-advpl.md` e `AGENTS0-advpl.md` são idênticos.
3. **Mistura de Contextos**: A pasta `docs/implementation/` mistura decisões de design (perenes) com relatórios de status de fase (transientes).
4. **Links Quebráveis**: Muitos documentos em `.design/` referenciam uns aos outros de forma relativa; movê-los exigirá atualização de links.
5. **Documentação de IA**: Prompts e planos de RAG estão divididos entre `docs/implementation/prompts/` e `.design/ai-*/`.

## 4. Estrutura Canônica Proposta
A nova estrutura deve seguir este padrão:
- `docs/architecture/`: Visão geral do sistema, padrões, fluxos de trabalho e ADRs.
- `docs/deploy/`: Infraestrutura, Docker, Migrations, Sentry, Redis.
- `docs/protheus/`: Diretrizes AdvPL/TLPP, Integração Protheus.
- `docs/ai/`: Planos de RAG, definições do Assistente, Prompts.
- `docs/product/`: Mapa de páginas, fluxos de usuário, arquitetura de informação.
- `docs/testing/`: Estratégia de testes, classificação, guias de E2E.
- `.design/historical/`: Relatórios de conclusão de fase, auditorias pontuais, resultados de testes de fumaça.

## 5. Matriz de Arquivos e Destinos Sugeridos

| Arquivo Atual | Categoria | Status | Destino Sugerido | Risco | Observação |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `documentacao.md` | arquitetura | Oficial | `docs/architecture/OVERVIEW.md` | Médio | Referenciado por múltiplos prompts. |
| `CLAUDE-advpl.md` | Protheus | Oficial | `docs/protheus/GUIDELINES.md` | Baixo | Guia principal para AdvPL. |
| `AGENTS0-advpl.md` | Protheus | Duplicado | Archive / `.design/historical/` | Baixo | Duplicata de CLAUDE-advpl.md. |
| `workflows/PROJECT_WORKFLOW.md` | arquitetura | Oficial | `docs/architecture/WORKFLOW.md` | Baixo | Define padrões de backend/frontend. |
| `workflows/PAGES_MAP.md` | produto | Oficial | `docs/product/PAGES_MAP.md` | Baixo | Mapa de rotas do frontend. |
| `workflows/ai-design-workflow.md` | IA | Oficial | `docs/ai/DESIGN_WORKFLOW.md` | Baixo | Fluxo de design de IA. |
| `docs/architecture/scoring-glossary.md`| arquitetura | Oficial | (Manter) | Baixo | - |
| `docs/deploy/DOCKER_LOCAL.md` | deploy | Oficial | (Manter) | Baixo | - |
| `.design/ai-architecture/RAG_PLAN.md` | IA | Oficial | `docs/ai/RAG_PLAN.md` | Médio | Plano mestre de RAG. |
| `.design/hr-system/INFORMATION_ARCHITECTURE.md`| produto | Oficial | `docs/product/IA.md` | Baixo | Estrutura de navegação. |
| `.design/candidate-portal-c2/PUBLIC_API_CONTRACT.md`| arquitetura | Oficial | `docs/architecture/API_CONTRACT.md` | Médio | Contrato oficial da API. |
| `docs/implementation/prompts/*.md` | IA | Oficial | `docs/ai/prompts/*.md` | Baixo | Centralizar prompts. |
| `docs/implementation/decisions/DATABASE_INDEX_OPTIMIZATION.md` | arquitetura | ADR | `docs/architecture/decisions/` | Baixo | Otimização de índices. |
| `docs/implementation/decisions/GOOGLE_FORMS_IMPORT_FLOW.md` | produto | ADR | `docs/product/GOOGLE_FORMS_IMPORT_FLOW.md` | Baixo | Fluxo de importação Forms. |
| `docs/implementation/decisions/RESUME_EXTRACTION_STUCK_FIX.md` | arquitetura | ADR | `docs/architecture/decisions/` | Baixo | Fix de extração de currículos. |
| `docs/implementation/phases/*.md` | relatório | Histórico | `.design/historical/phases/` | Baixo | Mover para histórico. |
| `docs/implementation/audits/*.md` | relatório | Histórico | `.design/historical/audits/` | Baixo | Mover para histórico. |
| `FIX_PUBLIC_APPLICATION_FKEY.md` | relatório | Legado | `.design/historical/fixes/` | Baixo | Relatório de fix pontual. |
| `skill.md` | legado | Incerto | Archive | Baixo | Arquivo vazio ou sem utilidade aparente. |

## 6. Documentos que não devem ser movidos
- `README.md` (Raiz): Deve permanecer como ponto de entrada.
- `.design/*/`: A grande maioria dos relatórios de fase devem permanecer em suas pastas originais dentro de `.design/` para manter o contexto histórico daquela tarefa específica, ou ser organizados sob uma pasta `.design/historical/`.
- `skills/**/*.md`: Documentação técnica interna das habilidades do agente.

## 7. Documentos candidatos a arquivamento
- `AGENTS0-advpl.md`: Duplicado de `CLAUDE-advpl.md`.
- `docs/implementation/README.md`: Indexador manual que ficará obsoleto após a reorganização.
- `skill.md`: Conteúdo irrelevante.

## 8. Riscos
1. **Quebra de Links**: Muitos arquivos em `.design/` usam links relativos. Mover os "Sources of Truth" para `docs/` exigirá uma auditoria e atualização de links em dezenas de arquivos.
2. **Dependência de Prompts**: As IAs (Claude/Gemini) podem ter caminhos para `documentacao.md` ou `PROJECT_WORKFLOW.md` em seus contextos/instruções. A mudança deve ser comunicada ou refletida nos arquivos de configuração do agente (como `CLAUDE.md` se existisse).
3. **Perda de Rastreabilidade**: Mover arquivos de fases pode dificultar encontrar o "porquê" de certas mudanças se não houver um redirecionamento ou um novo indexador claro.

## 9. Plano de Execução Futura
1. **Fase 1 (Preparação)**: Criar todas as pastas na estrutura canônica (concluído neste plano).
2. **Fase 2 (Movimentação de Fontes da Verdade)**: Mover os arquivos marcados como "Oficial" na matriz.
3. **Fase 3 (Atualização de Links)**: Rodar script para localizar e atualizar referências quebradas.
4. **Fase 4 (Limpeza)**: Mover relatórios de `docs/implementation/` para `.design/historical/` e remover duplicatas.
5. **Fase 5 (Novo Indexador)**: Atualizar o README principal para apontar para os novos locais da documentação oficial.

## 10. Confirmação
Nenhum arquivo de produção foi alterado, movido, renomeado ou apagado durante esta fase de planejamento. Apenas a estrutura de pastas foi criada e este relatório foi gerado.
