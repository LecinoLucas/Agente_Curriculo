# UX Hardening Report — AI-KNOWLEDGE-ADMIN-1A

## Antes

- Tela técnica demais para operação por RH/admin.
- Formulário de documento ficava exposto o tempo todo.
- Labels misturavam português e inglês.
- Chunks apareciam crus, sem proteção visual suficiente.
- Ações de arquivar e reindexar tinham pouco contexto operacional.
- Faltava teste de busca da própria base na tela.

## Depois

- Cabeçalho claro com título `Base de Conhecimento`, subtítulo funcional e aviso de segurança.
- Cards de resumo no topo para leitura rápida do estado da base.
- Labels e estados traduzidos para PT-BR.
- Criação de documento movida para fluxo explícito com botão `Novo documento`.
- Formulário com textarea maior, microcopy de uso institucional e validação de conteúdo sensível antes de salvar.
- Arquivamento com confirmação explícita.
- Reindexação com loading por documento e mensagens amigáveis.
- Chunks exibidos como `Chunk 1`, `Chunk 2`, com preview limitado e ação `Ver mais`.
- Seção `Testar busca nesta base` para validar recuperação de fontes sem abrir conversa com IA.

## Componentes alterados

- `frontend/src/pages/KnowledgeAdminPage.tsx`
- `frontend/src/pages/__tests__/KnowledgeAdminPage.test.tsx`

## Mudanças de UX

- Resumo visual com:
  - Documentos publicados
  - Rascunhos
  - Arquivados
  - Chunks indexados
  - Embeddings gerados
  - Documentos com erro
  - Última indexação
- Diagnóstico por documento com status de indexação, provider seguro, data da última indexação e erro sanitizado.
- Feedback operacional mais claro para reindexação e arquivamento.
- Busca administrativa focada em fonte e relevância, não em resposta conversacional.

## Testes executados

Frontend:

- `npx tsc --noEmit`
- `npm run test -- --run Knowledge`
- `npm run test -- --run AdminPage`
- `npm run test -- --run AiAssistantDrawer`
- `npm run build`

Backend:

- `pytest tests/unit/test_ai_knowledge_tools.py -v`
- `pytest tests/unit/test_seed_knowledge_base.py -v`
- `COVERAGE_FILE=/tmp/ai_rag_answer_service.coverage pytest tests/unit/test_ai_rag_answer_service.py -v`

## Limitações restantes

- `Embeddings gerados` continua mostrando `—` porque o contrato atual não expõe esse agregado de forma segura.
- `Modelo` e `Dimensões` ficam em `—` quando o endpoint não fornece esses metadados.
- A validação forte está no frontend; a próxima camada recomendada é repetir a rejeição de PII na ingestão backend para evitar bypass por cliente alternativo.
