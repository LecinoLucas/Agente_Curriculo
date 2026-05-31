# C-CORS — Configuração CORS para o candidate-portal

**Data:** 2026-05-31  
**Branch:** save/behavioral-ai-and-wips

---

## Diagnóstico inicial

O backend já possui CORS bem configurado em dois níveis (`backend/src/interface/api/main.py`):

```python
_cors_allow_origin_regex = (
    None
    if settings.is_production
    else r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$"
)

app = CORSMiddleware(
    app=app,
    allow_origins=settings.CORS_ORIGINS,          # lista explícita
    allow_origin_regex=_cors_allow_origin_regex,   # regex de dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Correlation-ID"],
)
```

**Conclusão:** Em dev (`APP_ENV != "production"`), o regex cobre automaticamente **qualquer porta** em `localhost`, `127.0.0.1`, `10.x.x.x` e `192.168.x.x`. Ou seja, `http://localhost:5174` já funcionava em dev **sem alteração de código**.

---

## O que foi alterado

### 1. `backend/src/core/settings.py` — defaults de `CORS_ORIGINS`

Antes:
```python
CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
```

Depois:
```python
CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    # frontend interno (staff/admin)
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # candidate-portal standalone
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
```

**Motivo:** Em produção o regex é desabilitado e apenas `CORS_ORIGINS` vale. Ter `5174` nos defaults garante que quem não configurar `.env` em dev ainda funciona via lista explícita. Também serve de documentação viva do que é esperado.

### 2. `backend/.env.example` — documentação da variável

Antes:
```
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

Depois:
```
# Frontends autorizados a enviar cookies (credentials: include).
# NÃO usar wildcard ("*") com allow_credentials=True.
# Dev: inclui frontend interno (5173) e candidate-portal standalone (5174).
# Em produção: substituir pelos domínios reais.
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173","http://localhost:5174","http://127.0.0.1:5174"]
```

---

## Por que NÃO houve alteração em `main.py`

O regex já cobre todos os casos de dev necessários:
- `http://localhost:5174` ✓ (regex: `localhost(:\d+)?`)
- `http://127.0.0.1:5174` ✓ (regex: `127\.0\.0\.1(:\d+)?`)
- `http://SEU_IP_LOCAL:5174` ✓ (regex: `10.\d+.\d+.\d+(:\d+)?` ou `192.168.\d+.\d+(:\d+)?`)

---

## Estratégia dev vs. produção

### Desenvolvimento

| Mecanismo | Comportamento |
|---|---|
| `_cors_allow_origin_regex` | Cobre **qualquer porta** em localhost/127/IPs privados |
| `CORS_ORIGINS` (default) | Lista explícita com 5173 e 5174 |
| `allow_credentials=True` | Cookies HttpOnly enviados corretamente |

→ **candidate-portal em dev funciona sem configuração adicional.**

### Produção (`APP_ENV=production`)

| Mecanismo | Comportamento |
|---|---|
| `_cors_allow_origin_regex` | **Desabilitado** (`None`) |
| `CORS_ORIGINS` | Deve ser configurado explicitamente no `.env` de produção |
| `allow_credentials=True` | Cookies `secure=True` (HTTPS obrigatório) |

**Configuração obrigatória em produção:**
```bash
# .env de produção — ajustar para os domínios reais
CORS_ORIGINS=["https://rh.marajo.com.br","https://vagas.marajo.com.br"]
```

Onde:
- `rh.marajo.com.br` = frontend interno (staff/admin)
- `vagas.marajo.com.br` = candidate-portal standalone

---

## Garantias de segurança

| Verificação | Status |
|---|---|
| Sem wildcard `*` com `allow_credentials=True` | ✅ Nunca usado |
| Origins explícitas em produção | ✅ Obrigatório via `CORS_ORIGINS` |
| Regex de dev desabilitado em prod | ✅ `if settings.is_production: None` |
| `http://localhost:5173` (frontend interno) continua funcionando | ✅ Está em `CORS_ORIGINS` defaults e no regex |
| `allow_credentials=True` necessário para cookies HttpOnly | ✅ Configurado |

---

## Comandos executados

```bash
# Verificação dos defaults
source backend/.venv/bin/activate
python3 -c "from src.core.settings import Settings; print(Settings.model_construct().CORS_ORIGINS)"
# → ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173',
#    'http://localhost:5174', 'http://127.0.0.1:5174']

python3 -m py_compile backend/src/core/settings.py
# → OK (sem erros de sintaxe)

npm --prefix candidate-portal run build   # ✓ sem alterações
npm --prefix frontend run build           # ✓ sem alterações
```

---

## Confirmações

- `main.py` — **zero alterações** (implementação CORS já era correta)
- `candidate-portal/` — **zero alterações**
- `frontend/` — **zero alterações**
- Sem wildcard CORS com credentials ✓
- Frontend interno porta 5173 continua funcionando ✓

---

## Pendências para C-Deploy

1. Definir domínio de produção do candidate-portal (ex: `vagas.marajo.com.br`)
2. Configurar `CORS_ORIGINS` no `.env` de produção com o domínio real
3. HTTPS obrigatório em produção para que `secure=True` no cookie funcione
4. Verificar que `APP_ENV=production` é setado corretamente no CI/CD
