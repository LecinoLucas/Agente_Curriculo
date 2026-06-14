# Project Workflow & Architecture

Este documento descreve o fluxo de trabalho padrão para desenvolvimento de novas funcionalidades e manutenção da estrutura do projeto.

---

## 1. Estrutura de Pastas

### Backend (`/backend`)
Seguimos uma arquitetura inspirada em Clean Architecture / Hexagonal:

- **`src/domain/`**: Regras de negócio puras, entidades e exceções. Não depende de frameworks.
- **`src/application/`**: Casos de uso e serviços que orquestram o domínio.
- **`src/infrastructure/`**: Implementações técnicas (Banco de Dados, S3, JWT).
  - `database/models/`: Definições SQLAlchemy.
  - `repositories/`: Padrão Repository para abstrair o banco.
- **`src/interface/`**: Entrada e saída de dados.
  - `api/routers/`: Endpoints FastAPI.
  - `api/schemas/`: Validação Pydantic.
  - `workers/`: Tarefas assíncronas (Celery/Tasks).

### Frontend (`/frontend`)
Arquitetura baseada em features:

- **`src/app/`**: Provedores, rotas globais e layout base.
- **`src/features/`**: O coração do app. Dividido por domínio (ex: `candidates`, `jobs`).
  - `components/`: Componentes específicos da feature.
  - `hooks/`: Lógica de estado e chamadas de API.
  - `services/`: Integração com o backend via Axios.
- **`src/pages/`**: Agregação de features em telas completas.
- **`src/shared/`**: Componentes de UI genéricos (botões, inputs, cards).

---

## 2. Fluxo de Implementação (Ponta a Ponta)

Siga esta ordem para garantir consistência:

### Fase 1: Banco de Dados
1. Crie o modelo em `src/infrastructure/database/models/`.
2. Gere a migração usando Alembic (se aplicável) ou ajuste o schema.
3. Implemente/Atualize o repositório em `src/infrastructure/repositories/`.

### Fase 2: Lógica de Negócio (Backend)
1. Defina exceções de domínio em `src/domain/exceptions.py`.
2. Crie Use Cases ou Serviços em `src/application/services/`.
3. Valide as regras do `AGENTS.md`.

### Fase 3: API
1. Crie os schemas Pydantic em `src/interface/api/schemas/`.
2. Adicione a rota no router correspondente em `src/interface/api/routers/`.
3. Garanta que as permissões (`RecruiterOrAdmin`, `InternalUser`) estejam corretas.

### Fase 4: Integração (Frontend)
1. Crie o serviço em `src/features/[feature]/services/`.
2. Implemente o hook de dados em `src/features/[feature]/hooks/` (usando `useQuery` ou `useMutation`).

### Fase 5: UI
1. Construa os componentes da feature.
2. Monte a página em `src/pages/`.
3. Registre a rota em `src/app/AppRouter.tsx`.

---

## 3. Regras de Ouro

- **Backend é a autoridade**: O frontend nunca decide quem é o candidato ativo ou qual o seu score. Ele apenas reflete o estado do backend.
- **Invariante de Domínio**: Respeite sempre `1 candidato = 1 pipeline ativo = 1 vaga ativa`.
- **Testes Primeiro**: Para mudanças críticas de domínio, crie primeiro um teste de integração em `backend/tests/integration/`.
- **Labels Padronizados**: Use "Aguardando Vaga" para candidatos sem pipeline ativo.

---

## 4. Checklist de Nova Página

- [ ] Rota adicionada ao `AppRouter.tsx` com a role correta.
- [ ] Lazy loading implementado para a página.
- [ ] Título da página definido via meta tags/document title.
- [ ] Tratamento de estado de erro e loading visível.
- [ ] Respeito ao design system (Tailwind/CSS variáveis).
