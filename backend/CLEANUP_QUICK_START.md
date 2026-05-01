# 🚀 Quick Start: Limpeza da Base de Dados

## TL;DR

Remover TUDO do banco (menos usuários) em 3 passos:

### 1️⃣ Fazer Backup (2 min)
```bash
cd backend
bash scripts/backup_before_cleanup.sh
```

### 2️⃣ Executar Limpeza (1 min)
```bash
python scripts/reset_db.py
```

Quando pedir confirmação, digite: `sim, tenho certeza`

### 3️⃣ Pronto! ✅
- ✅ Todos os usuários preservados
- ✅ Todos os dados antigos removidos
- ✅ Sistema pronto para começar do zero

---

## Arquivos Criados

```
backend/scripts/
├── reset_db.py                      ← Script Python (RECOMENDADO)
├── reset_database_keep_users.sql    ← Script SQL direto
├── backup_before_cleanup.sh         ← Cria backup antes de limpar
├── README_CLEANUP.md                ← Documentação completa
└── CLEANUP_QUICK_START.md          ← Este arquivo
```

## Quando Usar Cada Método

| Método | Quando Usar | Tempo | Segurança |
|--------|-----------|-------|-----------|
| **Python** (recomendado) | 🎯 Sempre | 1 min | ⭐⭐⭐⭐⭐ |
| **SQL direto** | Se Python falhar | 30s | ⭐⭐⭐ |
| **Bash backup** | Antes de qualquer coisa | 2 min | ⭐⭐⭐⭐⭐ |

## Sequência Recomendada

```
1. Backup automático
   ↓
2. Teste com --dry-run
   ↓
3. Limpeza real
   ↓
4. Verificar usuários preservados
```

### Passo a Passo Detalhado

#### 1. Backup Automático + Seguro
```bash
bash scripts/backup_before_cleanup.sh
```
- ✅ Cria arquivo `.backups/resume_ai_backup_TIMESTAMP.sql`
- ✅ Mostra antes/depois (candidatos, vagas, etc)
- ✅ Pergunta se quer prosseguir com limpeza agora

#### 2. (Opcional) Teste com Dry-Run
```bash
python scripts/reset_db.py --dry-run
```
- Mostra o que seria removido
- Não remove nada
- Perfeito para ver os números

#### 3. Executar Limpeza Real
```bash
python scripts/reset_db.py
```
- Pede confirmação verbal
- Mostra progresso
- Mostra resultado final (usuários preservados)

#### 4. Verificar Resultado
```bash
# Ver usuários (devem estar preservados)
psql -U postgres -d resume_ai -c "SELECT id, email, full_name FROM \"user\";"

# Ver que candidatos foram removidos
psql -U postgres -d resume_ai -c "SELECT COUNT(*) FROM candidate;"
# Resultado esperado: 0
```

---

## Dados Preservados ✅

- ✅ Tabela `user` (todos os usuários)
- ✅ Credentials (senhas hash)
- ✅ Roles (admin, recruiter, etc)
- ✅ Configuração de conta

## Dados Removidos ❌

- ❌ Candidatos
- ❌ Vagas
- ❌ Resumes
- ❌ Análises
- ❌ Scores
- ❌ Pipeline
- ❌ Eventos
- ❌ Audit logs (histórico de mudanças)

---

## Troubleshooting Rápido

### Erro: "DATABASE_URL not found"
```bash
# Verifique se .env existe e tem DATABASE_URL
cat .env | grep DATABASE_URL

# Se não tiver, configure:
echo "DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/resume_ai" >> .env
```

### Erro: "Database is locked"
```bash
# Kill conexões antigas:
psql -U postgres -d resume_ai -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'resume_ai' AND pid <> pg_backend_pid();"

# Depois tente novamente
python scripts/reset_db.py
```

### Erro: "Connection refused"
```bash
# PostgreSQL não está rodando. Inicie:
docker-compose up -d postgres

# Aguarde estar pronto:
docker-compose exec postgres pg_isready
# Resultado esperado: accepting connections
```

---

## Recuperar se Algo Deu Errado

```bash
# Ver backups disponíveis
ls -lh .backups/

# Restaurar o mais recente
psql -U postgres -d resume_ai < .backups/resume_ai_backup_20240429_143022.sql

# Ou restaurar um específico
psql -U postgres -d resume_ai < .backups/resume_ai_backup_20240428_120000.sql
```

---

## Próximas Etapas

Após a limpeza:

1. **Teste login:** Entre no sistema com um usuário existente
2. **Crie novas vagas:** Comece a adicionar vagas
3. **Importe candidatos:** Suba candidatos novos

---

## Mais Informações

Para detalhes completos, veja: [README_CLEANUP.md](./scripts/README_CLEANUP.md)

---

**❓ Dúvidas?** A maioria dos erros está documentada em `README_CLEANUP.md`.
