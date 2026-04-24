# 🧪 Guia de Testes e Validação - v_job_candidate_ranking

## ✅ Checklist de Validação

### 1. Migration aplicada corretamente?
```bash
cd backend
alembic current
# Esperado: a7f2b8c3d4e5 (create_v_job_candidate_ranking)
```

### 2. VIEW existe no banco?
```sql
psql -U postgres -d seu_database -c "
SELECT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_name = 'v_job_candidate_ranking'
    AND table_schema = 'public'
) as view_exists;"
# Esperado: true
```

### 3. SELECT funciona?
```sql
SELECT * FROM v_job_candidate_ranking LIMIT 1;
```

---

## 🧪 Testes SQL Completos

### Test 1: Estrutura da VIEW
```sql
-- Verificar todas as colunas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'v_job_candidate_ranking'
ORDER BY ordinal_position;
```

**Esperado**:
| column_name | data_type |
|---|---|
| job_id | uuid |
| job_title | character varying |
| candidate_id | uuid |
| candidate_name | character varying |
| email | character varying |
| match_score | numeric |
| recommendation | ... |
| matched_skills | jsonb |
| missing_skills | jsonb |
| overall_score | numeric |
| seniority_level | ... |
| total_experience_years | numeric |
| match_created_at | timestamp with time zone |

### Test 2: Contar matches por vaga
```sql
SELECT 
    job_id,
    job_title,
    COUNT(*) as candidate_count,
    AVG(match_score) as avg_score,
    MAX(match_score) as best_score
FROM v_job_candidate_ranking
GROUP BY job_id, job_title
ORDER BY candidate_count DESC;
```

**Esperado**: Uma linha por vaga com matches

### Test 3: Filtrar por recomendação
```sql
SELECT 
    recommendation,
    COUNT(*) as count
FROM v_job_candidate_ranking
GROUP BY recommendation;
```

**Esperado**:
```
recommendation      | count
--------------------|-------
strong_match       | 150
good_match         | 320
potential          | 280
not_recommended    | 450
NULL               | 100  (análises sem resultado ainda)
```

### Test 4: Melhor candidato por vaga
```sql
SELECT DISTINCT ON (job_id)
    job_id,
    job_title,
    candidate_id,
    candidate_name,
    email,
    match_score,
    recommendation
FROM v_job_candidate_ranking
ORDER BY job_id, match_score DESC NULLS LAST;
```

### Test 5: Candidatos com todos os skills
```sql
SELECT 
    candidate_id,
    candidate_name,
    COUNT(*) as total_matches,
    COUNT(CASE WHEN array_length(missing_skills, 1) = 0 THEN 1 END) as perfect_fits
FROM v_job_candidate_ranking
WHERE missing_skills IS NOT NULL
GROUP BY candidate_id, candidate_name
ORDER BY perfect_fits DESC;
```

### Test 6: Performance query
```sql
EXPLAIN ANALYZE
SELECT *
FROM v_job_candidate_ranking
WHERE job_id = (SELECT id FROM jobs LIMIT 1)
ORDER BY match_score DESC NULLS LAST
LIMIT 50;
```

**Esperado**: < 100ms (Planning + Execution)

---

## 🐍 Testes Python (Repository)

### Test 1: Chamar method do repository
```python
import asyncio
from uuid import UUID
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Setup (assumindo que o database já está configurado)
async def test_list_candidate_ranking():
    from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
    
    # Obter uma job_id existente do banco
    async with sessionmaker(..., class_=AsyncSession, expire_on_commit=False) as session:
        repo = SQLAlchemyJobRepository(session)
        
        job_id = UUID("12345678-1234-5678-1234-567812345678")  # substitua com UUID real
        
        result = await repo.list_candidate_ranking(job_id)
        
        # Validações
        assert isinstance(result, list), "Result must be a list"
        assert len(result) > 0, "Result should have candidates"
        
        first_candidate = result[0]
        assert 'candidate_id' in first_candidate
        assert 'candidate_name' in first_candidate
        assert 'email' in first_candidate
        assert 'match_score' in first_candidate
        assert 'recommendation' in first_candidate
        
        print(f"✅ Found {len(result)} candidates for job")
        print(f"   Top candidate: {first_candidate['candidate_name']} ({first_candidate['match_score']})")

# Executar
asyncio.run(test_list_candidate_ranking())
```

### Test 2: Testar com múltiplas vagas
```python
async def test_multiple_jobs():
    from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
    
    async with sessionmaker(..., class_=AsyncSession, expire_on_commit=False) as session:
        repo = SQLAlchemyJobRepository(session)
        
        # Obter todas as jobs ativas
        jobs = await session.execute(sa.select(JobModel).where(JobModel.deleted_at.is_(None)))
        job_ids = [job.id for job in jobs.scalars()]
        
        total_matches = 0
        for job_id in job_ids[:5]:  # Testar as 5 primeiras
            ranking = await repo.list_candidate_ranking(job_id)
            total_matches += len(ranking)
            print(f"Job {job_id}: {len(ranking)} candidates")
        
        print(f"Total matches across 5 jobs: {total_matches}")
        assert total_matches > 0, "Should have matches"

asyncio.run(test_multiple_jobs())
```

### Test 3: Testar tratamento de NULL (análises sem resultado)
```python
async def test_null_analysis_results():
    """Verificar que análises sem resultado aparecem com NULLs"""
    from sqlalchemy import text
    
    async with sessionmaker(..., class_=AsyncSession, expire_on_commit=False) as session:
        # Query raw para ver NULLs
        query = text("""
            SELECT 
                job_id,
                candidate_name,
                overall_score,
                seniority_level,
                total_experience_years
            FROM v_job_candidate_ranking
            WHERE overall_score IS NULL
            LIMIT 10
        """)
        
        result = await session.execute(query)
        rows = result.mappings().all()
        
        if rows:
            print(f"✅ Found {len(rows)} candidates with incomplete analysis")
            print(f"   (ainda processando ou falharam)")
        else:
            print("ℹ️  Todas as análises têm resultados (ou nenhum match)")

asyncio.run(test_null_analysis_results())
```

---

## 🔍 Testes de Integridade de Dados

### Test: Soft delete cascata
```python
async def test_soft_delete_cascading():
    """Verificar que candidatos deletados desaparecem da VIEW"""
    from src.domain.entities.candidate import Candidate
    
    async with sessionmaker(..., class_=AsyncSession, expire_on_commit=False) as session:
        # 1. Contar matches do candidato antes
        query_before = text("""
            SELECT COUNT(*) FROM v_job_candidate_ranking
            WHERE candidate_id = :cid
        """)
        
        count_before = await session.scalar(query_before, {"cid": candidate_id})
        print(f"Matches antes: {count_before}")
        
        # 2. Soft delete o candidato
        candidate = await session.get(Candidate, candidate_id)
        candidate.deleted_at = datetime.now(timezone.utc)
        await session.commit()
        
        # 3. Contar matches depois
        count_after = await session.scalar(query_before, {"cid": candidate_id})
        print(f"Matches depois: {count_after}")
        
        # Validação
        assert count_after == 0, "Candidato deletado não deve aparecer na VIEW"
        print("✅ Soft delete funcionou corretamente")

asyncio.run(test_soft_delete_cascading())
```

---

## 🚀 Testes de Performance (Load Test)

### Simular 1000 consultas
```python
import time
import random

async def test_performance_load():
    """Executar 1000 queries para medir performance"""
    from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
    
    async with sessionmaker(..., class_=AsyncSession, expire_on_commit=False) as session:
        repo = SQLAlchemyJobRepository(session)
        
        # Obter 10 job_ids aleatórias
        jobs = await session.execute(
            sa.select(JobModel.id)
            .where(JobModel.deleted_at.is_(None))
            .limit(10)
        )
        job_ids = [j[0] for j in jobs]
        
        if not job_ids:
            print("⚠️  Nenhuma vaga ativa para teste")
            return
        
        # Executar 1000 queries
        times = []
        for i in range(1000):
            job_id = random.choice(job_ids)
            
            start = time.time()
            result = await repo.list_candidate_ranking(job_id)
            elapsed = (time.time() - start) * 1000  # ms
            times.append(elapsed)
            
            if (i + 1) % 100 == 0:
                print(f"Executadas {i+1} queries...")
        
        # Estatísticas
        avg_time = sum(times) / len(times)
        max_time = max(times)
        min_time = min(times)
        
        print(f"""
        Performance Results (1000 queries):
        - Min:  {min_time:.2f}ms
        - Avg:  {avg_time:.2f}ms
        - Max:  {max_time:.2f}ms
        
        ✅ PASS if Avg < 100ms
        """)

asyncio.run(test_performance_load())
```

---

## 📋 Exemplos de Queries com a VIEW

### Exemplo 1: Dashboard - Top 5 vagas com mais candidatos
```sql
SELECT 
    job_id,
    job_title,
    COUNT(*) as candidates_count,
    COUNT(CASE WHEN recommendation = 'strong_match' THEN 1 END) as strong_matches,
    COUNT(CASE WHEN recommendation = 'good_match' THEN 1 END) as good_matches,
    AVG(match_score)::numeric(5,2) as avg_score
FROM v_job_candidate_ranking
GROUP BY job_id, job_title
ORDER BY candidates_count DESC
LIMIT 5;
```

### Exemplo 2: Candidato multivagas (aparece em múltiplas vagas)
```sql
SELECT 
    candidate_id,
    candidate_name,
    COUNT(DISTINCT job_id) as job_count,
    AVG(match_score)::numeric(5,2) as avg_match,
    MAX(match_score)::numeric(5,2) as best_match
FROM v_job_candidate_ranking
GROUP BY candidate_id, candidate_name
HAVING COUNT(DISTINCT job_id) > 1
ORDER BY avg_match DESC;
```

### Exemplo 3: Filtro avançado
```sql
SELECT 
    job_id,
    job_title,
    candidate_id,
    candidate_name,
    email,
    match_score,
    seniority_level,
    total_experience_years
FROM v_job_candidate_ranking
WHERE recommendation IN ('strong_match', 'good_match')
  AND total_experience_years >= 5
  AND seniority_level IN ('senior', 'lead', 'principal')
  AND job_id = 'job-uuid-here'
ORDER BY match_score DESC;
```

---

## 📚 Checklist Final

- [ ] Migration aplicada: `alembic upgrade head`
- [ ] VIEW criada: `SELECT * FROM v_job_candidate_ranking LIMIT 1;`
- [ ] Sem erros SQL
- [ ] Repository method retorna dados
- [ ] Performance < 100ms por query
- [ ] Soft deletes funcionam corretamente
- [ ] NULL handling para análises incompletas
- [ ] Índices presentes e sendo usados
- [ ] Testes de integração passam
- [ ] Pronto para produção ✅

---

## 🆘 Troubleshooting

### Erro: "Relation v_job_candidate_ranking does not exist"
```bash
# Migration não foi aplicada
alembic upgrade head

# Ou verificar status
alembic current
alembic history
```

### Erro: "Column not found"
- Verify se as tabelas base existem:
```sql
SELECT EXISTS (SELECT 1 FROM resume_job_matches) as has_matches;
SELECT EXISTS (SELECT 1 FROM analysis_results) as has_results;
SELECT EXISTS (SELECT 1 FROM candidates WHERE deleted_at IS NULL) as has_active_candidates;
```

### Query lenta (> 1s)
```sql
-- Verificar plano de execução
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM v_job_candidate_ranking 
WHERE job_id = 'uuid' 
LIMIT 50;

-- Se houver Sequential Scans, verificar índices:
\di resume_job_matches_*
\di analysis_results_*
```

### NULLs em overall_score
- ✅ Esperado: análises ainda em processamento
- Verifique: `SELECT status, COUNT(*) FROM analyses GROUP BY status;`
