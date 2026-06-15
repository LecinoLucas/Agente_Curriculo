# Frontend - Resume AI System

Frontend corporativo em React + TypeScript com foco em escalabilidade, componentização e controle de acesso por perfil.

## Estrutura de pastas

```text
frontend/
  src/
    app/                # rotas e proteção de acesso
    components/
      common/           # componentes reutilizáveis
      layout/           # shell com sidebar/topbar
    features/
      auth/             # contexto de autenticação
    hooks/              # hooks compartilhados
    pages/              # telas de negócio
    services/           # integração HTTP/API
    styles/             # estilos globais
    types/              # contratos de tipos
    utils/              # utilitários (storage, helpers)
```

## Telas incluídas

- Dashboard
- Currículos
- Análises
- Vagas

## Controle de acesso

- Perfis suportados: `admin`, `recruiter`, `candidate`, `viewer`
- Menu lateral e rotas com controle por perfil.

## Integração com API

- Base URL via `VITE_API_BASE_URL`
- Endpoints usando `/api/v1`
- Fluxo de auth com `login`, `refresh` por cookie `HttpOnly`, `logout`, `users/me`
- O card `Status Protheus` consome apenas o backend do Admissão RH.
- Nunca configurar `VITE_*` com `PROTHEUS_BRIDGE_INTERNAL_API_KEY`.
- O link `Abrir cockpit técnico` abre a URL retornada pelo backend, sem executar ações na bridge.

## Execução

```bash
cp .env.example .env
npm install
npm run dev
```
