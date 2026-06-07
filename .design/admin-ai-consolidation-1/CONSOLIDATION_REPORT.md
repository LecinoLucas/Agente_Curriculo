# ADMIN-AI-CONSOLIDATION-1

## O que foi consolidado

- A aba `IA` de `/admin` passou a ser o hub principal de governança de IA.
- A visualização de `IA / Tokens` antes acoplada a `/admin/health` foi extraída para um componente reutilizável.
- O `/admin` agora combina status, warnings, atalhos operacionais, consumo por feature e últimas chamadas com a mesma base visual de métricas usada no health.

## Componentes extraídos e reaproveitados

- `frontend/src/features/ai-settings/components/AiUsagePanel.tsx`
  - Centraliza filtros, cards de consumo, tabelas por provider/modelo, uso diário e análises mais caras.
  - Consome o endpoint já existente de uso de IA do health.
- `frontend/src/features/ai-settings/components/AiGovernancePanel.tsx`
  - Compõe o hub de governança para `/admin`.
  - Reúne resumo executivo, status, warnings, atalhos, consumo por feature e últimas chamadas.

## O que ficou em /admin

- Hub principal de governança de IA.
- Resumo executivo.
- Cards de status de Gemini, RAG, embeddings, assistant read-only e Protheus.
- Painel completo de `IA / Tokens` reaproveitado.
- Últimas chamadas e consumo por feature.
- Atalhos para laboratório, credenciais, health e auditoria.

## O que ficou em /admin/health

- Continua como visão técnica do sistema.
- Mantém a aba `IA / Tokens`.
- Continua exibindo limites, catálogo de preços e backfill de custos, além das demais abas de health.
- Passou a reutilizar `AiUsagePanel` para evitar duplicidade visual e lógica de frontend.

## O que ficou em /admin/ia

- Laboratório IA preservado como rota dedicada para status detalhado e testes rápidos controlados.
- Nenhuma exposição de secret, prompt bruto, resposta bruta, `content_hash`, `vector_json` ou `embedding`.

## Riscos restantes

- A governança do `/admin` depende de dois endpoints existentes com responsabilidades diferentes, então pequenas divergências temporais entre status resumido e métricas podem aparecer.
- Mudanças futuras no payload de uso do health ou do resumo de IA exigirão ajuste coordenado nos dois painéis reutilizadores.

## Próxima fase recomendada

- Consolidar labels, formatação e estados vazios entre `/admin`, `/admin/health` e `/admin/ia`, reduzindo ainda mais diferenças de UX sem alterar contratos de backend.
