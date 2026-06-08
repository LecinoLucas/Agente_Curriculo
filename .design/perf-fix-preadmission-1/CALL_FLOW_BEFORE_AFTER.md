# PERF-FIX-PREADMISSION-1 — Call Flow Before/After

## Abertura inicial

### Antes

```text
Abrir caso
├─ GET /overview
├─ GET /documents
└─ GET /events
```

### Depois

```text
Abrir caso
├─ GET /overview
├─ GET /documents
└─ GET /events
```

Mantido em paralelo. Nenhuma mudança de backend nesta fase.

## Ações em documentos

### Antes

```text
POST approve/reject/request-correction
├─ GET /overview
└─ GET /documents
```

Isso acontecia mesmo quando o endpoint de ação já devolvia o documento atualizado.

### Depois

```text
POST approve/reject/request-correction
├─ patch local do documento afetado
├─ patch local do checklist afetado
└─ GET /overview
```

Fallback seguro:

```text
POST approve/reject/request-correction
├─ resposta incompleta ou patch local falhou
├─ GET /overview
└─ GET /documents
```

## Ação em checklist

### Antes

```text
POST mark-not-required
├─ GET /overview
└─ GET /documents
```

### Depois

```text
POST mark-not-required
├─ usa checklist/documents retornados pelo endpoint quando disponíveis
└─ GET /overview
```

Fallback:

```text
POST mark-not-required
├─ retorno insuficiente
├─ GET /overview
└─ GET /documents
```

## Eventos

### Antes

- Abertura inicial carregava eventos uma vez.
- Ações de documento nao recarregavam `events`, mas continuavam recarregando `documents` inteiro.

### Depois

- Abertura inicial continua carregando `events` uma vez.
- Ações de documento continuam sem recarregar `events`.
- `events` so volta a ser recarregado no refresh manual completo ou em `mark ready`.

## Chamadas removidas

- `GET /documents` apos approve quando o retorno do endpoint de approve e suficiente.
- `GET /documents` apos reject/request-correction quando o retorno do endpoint e suficiente.
- `GET /documents` apos mark-not-required quando o endpoint devolve `checklist + documents`.

## Chamadas mantidas

- `GET /overview + /documents + /events` na abertura inicial.
- `GET /overview` apos mutacoes que alteram contadores, resumo e readiness.
- `GET /overview + /documents + /events` no botao manual `Recarregar workspace`.
- `GET /overview + /documents + /events` em `mark ready`, porque muda estado do caso e historico operacional.

## Limitacoes de contrato backend

- `approvePreAdmissionDocument` e `rejectPreAdmissionDocument` devolvem `PreAdmissionDocument`, nao o payload completo de `documents`.
- Esse contrato permite atualizar status, timestamps tecnicos e motivo publico localmente, mas nao traz `reviewed_by_name`.
- Quando o retorno da mutacao nao permite localizar o documento atual ou vier incompleto, o frontend cai para `GET /documents`.
