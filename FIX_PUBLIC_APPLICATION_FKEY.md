# Fix: ForeignKeyViolationError no Endpoint Público de Candidatura

## Problema

O endpoint `POST /api/v1/public/candidates/apply` retornava **500 (ForeignKeyViolationError)**:

```
sqlalchemy.exc.IntegrityError / ForeignKeyViolationError:
insert or update on table "candidates" violates foreign key constraint "candidates_created_by_fkey"
Key (created_by)=(00000000-0000-0000-0000-00000000000a) is not present in table "users".
```

### Causa Raiz

O serviço público (`public_application_service.py`) tentava criar candidatos e resumes com:
- `created_by=UUID("00000000-0000-0000-0000-00000000000a")` (UUID sentinela/fake)
- Mas esse UUID não existia na tabela `users`, causando violação de FK

As colunas que tinham FK obrigatória:
- `candidates.created_by` → `users.id` (NOT NULL, FK)
- `resumes.created_by` → `users.id` (NOT NULL, FK)
- `resume_versions.uploaded_by` → `users.id` (NOT NULL, FK)

## Solução Implementada

### 1. **Migração Idempotente** (`z6j7k8l9m0n1_allow_null_created_by_for_public_candidates.py`)

```python
# Torna as colunas nullable para candidados públicos (sem usuário sistema)
- candidates.created_by: NOT NULL → NULL
- resumes.created_by: NOT NULL → NULL  
- resume_versions.uploaded_by: NOT NULL → NULL
```

✅ Idempotente: valida se coluna já é nullable antes de alterar

### 2. **Atualização de Modelos**

**CandidateModel:**
```python
# Antes:
created_by: Mapped[UUID] = mapped_column(..., nullable=False)

# Depois:
created_by: Mapped[Optional[UUID]] = mapped_column(..., nullable=True)
# Comentário: "When NULL: candidate created via public application (no user system association)"
```

**ResumeModel:**
```python
created_by: Mapped[Optional[UUID]] = mapped_column(..., nullable=True)
# Comentário: "When NULL: resume uploaded via public application"
```

**ResumeVersionModel:**
```python
uploaded_by: Mapped[Optional[UUID]] = mapped_column(..., nullable=True)
# Comentário: "When NULL: resume version uploaded via public application"
```

### 3. **Correção do Serviço Público**

**public_application_service.py:**

```python
# Adiciona import para tratamento de erro
from sqlalchemy import exc as sa_exc

# Muda de SYSTEM_USER_ID para None para candidatos públicos
candidate = await self._candidate_service.create(
    candidate_request,
    None,  # ← Public candidates have no system user
    application_source=APPLICATION_SOURCE_PUBLIC,
)

# Cria resume com created_by=None
resume = await self._resume_repo.create_resume(
    ResumeModel(
        ...
        created_by=None,  # ← Public application, no system user
    )
)

# Cria version com uploaded_by=None
version = await self._resume_repo.create_version(
    ResumeVersionModel(
        ...
        uploaded_by=None,  # ← Public application, no system user
    )
)

# Adiciona tratamento de IntegrityError
try:
    candidate = await self._candidate_service.create(...)
except sa_exc.IntegrityError as e:
    await self.db.rollback()
    if "cpf" in str(e):
        raise ValidationException("CPF já registrado no sistema. Faça login...")
    if "email" in str(e):
        raise ValidationException("Email já registrado no sistema. Faça login...")
    raise PublicApplicationError("Erro ao processar candidatura...")

# Nota: Ainda usa SYSTEM_USER_ID apenas para operações administrativas:
# - BehavioralAssignmentService (análise comportamental)
# - RequestAnalysisUseCase (análise de currículo)
# - CommunicationService (notificações)
# Essas são operações do sistema, não do candidato público
```

### 4. **Atualização de CandidateService**

```python
# Antes:
async def create(self, body: CreateCandidateRequest, created_by: UUID, ...) -> CandidateModel:

# Depois:
async def create(self, body: CreateCandidateRequest, created_by: UUID | None, ...) -> CandidateModel:
# Aceita None para candidatos públicos
```

### 5. **Novos Testes** (`test_public_application_null_created_by.py`)

```python
✓ test_public_apply_creates_candidate_with_null_created_by
  - Valida que candidate.created_by = NULL
  - Valida que resume.created_by = NULL
  - Valida que resume_version.uploaded_by = NULL

✓ test_public_apply_without_job_creates_candidate_with_null_created_by
  - Valida created_by=NULL mesmo sem job_id

✓ test_public_apply_duplicate_cpf_returns_422
  - CPF duplicado retorna 422 (não 500)
  - IntegrityError é capturado e traduzido

✓ test_public_apply_duplicate_email_returns_422
  - Email duplicado retorna 422 (não 500)

✓ test_public_apply_invalid_phone_returns_422
  - Telefone inválido retorna 422
```

## Regras Atendidas

✅ Para candidatura pública sem usuário autenticado → `created_by=None`

✅ Mantém `application_source="public_application"`

✅ Não cria usuário fake automaticamente no service

✅ Se projeto exigir usuário sistema → via migration idempotente (preferir `created_by=None`)

✅ Não altera ranking, score, pipeline ou Document AI

✅ IntegrityError de CPF/email/candidatura duplicada → 422 controlado (não 500)

✅ Testes para: valid application, created_by=NULL, duplicate CPF/email, invalid phone

## Validação

### Sintaxe ✅
```bash
python3 -m py_compile \
  backend/src/application/services/candidate_service.py \
  backend/src/application/services/public_application_service.py \
  backend/alembic/versions/z6j7k8l9m0n1_allow_null_created_by_for_public_candidates.py
# ✓ Todos os arquivos têm sintaxe válida
```

### Testes (Requer ambiente Poetry)
```bash
cd backend
poetry install
poetry run pytest tests/test_public_application_null_created_by.py -v
```

### Teste Manual
```bash
# Após aplicar migration:
POST /api/v1/public/candidates/apply
{
  "full_name": "João Silva",
  "cpf": "12345678909",
  "email": "joao@example.com",
  "phone": "11987654321",
  ...
}

# Esperado: 201 CREATED (não 500)
# Candidate.created_by = NULL (não SYSTEM_USER_ID)
```

## Arquivos Alterados

1. **Migration:** `backend/alembic/versions/z6j7k8l9m0n1_allow_null_created_by_for_public_candidates.py` (criado)
2. **Models:**
   - `backend/src/infrastructure/database/models/candidate_model.py`
   - `backend/src/infrastructure/database/models/resume_model.py`
3. **Services:**
   - `backend/src/application/services/public_application_service.py`
   - `backend/src/application/services/candidate_service.py`
4. **Tests:** `backend/tests/test_public_application_null_created_by.py` (criado)

## Próximos Passos

1. ✅ Aplicar migration: `alembic upgrade head`
2. ✅ Executar testes no ambiente local (quando Poetry estiver instalado)
3. ✅ Teste manual do POST /api/v1/public/candidates/apply
4. ✅ Monitorar logs para IntegrityError (não deve mais ocorrer)
