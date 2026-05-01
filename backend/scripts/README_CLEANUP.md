# 🗑️ Script de Limpeza do Banco de Dados

## ⚠️ CUIDADO

Este script remove **TODOS os dados operacionais** do sistema:
- ❌ Candidatos
- ❌ Vagas
- ❌ Análises
- ❌ Resumes
- ❌ Scores
- ❌ Pipeline de candidatos
- ❌ Eventos e auditoria
- ✅ **Usuários são PRESERVADOS**

## Métodos de Limpeza

### Opção 1: Python (Recomendado)

```bash
# Navegue para o diretório backend
cd backend

# Teste o que será removido (sem fazer nada)
python scripts/reset_db.py --dry-run

# Execute com confirmação interativa
python scripts/reset_db.py

# Force a execução sem pedir confirmação (use com MUITO cuidado!)
python scripts/reset_db.py --confirm
```

**Vantagens:**
- ✅ Mais seguro (pede confirmação)
- ✅ Conta registros antes/depois
- ✅ Manipula modelos SQLAlchemy direto
- ✅ Trata erros com graça

### Opção 2: SQL Direto

```bash
# Via psql na linha de comando
psql -U postgres -d resume_ai -f scripts/reset_database_keep_users.sql

# Ou via Docker (se rodando em container)
docker-compose exec postgres psql -U postgres -d resume_ai -f scripts/reset_database_keep_users.sql
```

**Vantagens:**
- ✅ Mais rápido
- ✅ Direto no banco

## Processo Passo-a-Passo

### 1. Backup (CRÍTICO!)

```bash
# Faça um backup antes de qualquer coisa!
pg_dump -U postgres -d resume_ai > backup_$(date +%Y%m%d_%H%M%S).sql

# Ou via Docker
docker-compose exec postgres pg_dump -U postgres -d resume_ai > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Teste com Dry-Run

```bash
python scripts/reset_db.py --dry-run
```

Exemplo de output:
```
================================================================================
🗑️  LIMPEZA NUCLEAR DO BANCO DE DADOS
================================================================================

📊 Estado ANTES da limpeza:
  Usuários.......................................5
  Candidatos....................................150
  Resumes.......................................180
  Vagas...........................................8
  Pipeline......................................120
  Análises.......................................150
  Scores........................................150
  [...]

🔍 DRY-RUN: Nenhuma alteração foi feita.
```

### 3. Execute a Limpeza Real

```bash
python scripts/reset_db.py
```

Será pedido confirmação:
```
⚠️  ATENÇÃO: Esta ação é IRREVERSÍVEL!
⚠️  Serão removidos TODOS os dados, exceto usuários cadastrados

Digite 'sim, tenho certeza' para proceder: sim, tenho certeza
```

### 4. Verifique o Resultado

```bash
# Veja os usuários que foram preservados
psql -U postgres -d resume_ai -c "SELECT id, email, full_name, role FROM \"user\";"
```

## Recuperar de um Backup

Se algo der errado:

```bash
# Restaurar o backup
psql -U postgres -d resume_ai < backup_20240429_143022.sql
```

## O que Acontece com os Usuários?

✅ **Todos os usuários são preservados:**
- IDs não mudam
- Emails permanecem
- Roles permanecem
- Senhas não são tocadas
- Tokens de autenticação continuam válidos

**Os usuários pode fazer login normalmente após a limpeza.**

## Problemas Comuns

### "Database is locked"
```
❌ Erro: database is locked
```

**Solução:** Encerre outras conexões:
```bash
# Kill todas as conexões (exceto a sua)
psql -U postgres -d resume_ai -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'resume_ai' AND pid <> pg_backend_pid();"
```

### "Sequência não encontrada"
```
❌ ALTER SEQUENCE ... não encontrada
```

**Solução:** Isso é normal - o script ignora sequências que não existem.

### "Falta de permissão"
```
❌ ERROR: permission denied for schema public
```

**Solução:** Execute como superuser:
```bash
python scripts/reset_db.py  # Já usa credenciais do .env
```

## Backup Automático (Cron)

Para fazer backup automático antes da limpeza:

```bash
# Adicionar ao crontab
0 2 * * * pg_dump -U postgres -d resume_ai > /backups/resume_ai_$(date +\%Y\%m\%d).sql
```

## Verificação Final

Após a limpeza, verifique:

```bash
# 1. Usuários foram preservados
psql -U postgres -d resume_ai -c "SELECT COUNT(*) as user_count FROM \"user\";"

# 2. Candidatos foram removidos
psql -U postgres -d resume_ai -c "SELECT COUNT(*) as candidate_count FROM candidate;"

# 3. Verificar integridade referencial
psql -U postgres -d resume_ai -c "
  SELECT constraint_name, constraint_type
  FROM information_schema.table_constraints
  WHERE table_name IN (
    'candidate', 'resume', 'job', 'candidate_pipeline', 'analysis'
  )
  ORDER BY table_name, constraint_name;
"
```

Esperado após limpeza:
```
user_count: 5 (seu número de usuários)
candidate_count: 0
```

## Segurança

- 🔐 O script pede confirmação verbal
- 🔐 Usa SQLAlchemy ORM (typesafe)
- 🔐 Transações atômicas (tudo ou nada)
- 🔐 Preserva foreign keys
- 🔐 Log de operações em audit_log antes de limpar

## Próximas Etapas

Após a limpeza, você pode:

1. **Comece do zero:**
   - Crie novos usuários/vagas via API
   - Suba candidatos novos

2. **Restaure dados seletivamente:**
   - Use seu backup para extrair dados específicos
   - Importe manualmente via API

3. **Implante em staging primeiro:**
   ```bash
   # Teste em environment de staging
   python scripts/reset_db.py  # (em .env.staging)
   ```

---

**Dúvidas ou problemas?** Verifique a saída do script ou consulte o `.sql` gerado.
