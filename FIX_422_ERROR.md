# Correção do Erro 422 ao Editar Vaga com Skill

## **Problema Relatado**
No frontend, ao editar uma vaga e adicionar skill, o PATCH `/api/v1/jobs/{id}` retornava erro 422 (Unprocessable Entity).

## **Raiz Causa Identificada**

Após análise dos logs do console, descobriu-se **DÓ problemas principais**:

### **Problema 1: Operador Inválido em Deal Breaker (CRÍTICO)**
```json
{
  "type": "value_error",
  "loc": ["body", "deal_breakers", 1, "operator"],
  "msg": "Operator 'equals' not allowed for field 'skill'. Allowed: contains, not_contains"
}
```

O campo `skill` requer operadores `contains` ou `not_contains`, mas o frontend estava usando `equals` como padrão.

### **Problema 2: Tipos Decimal Enviados como Números (SECUNDÁRIO)**
Backend espera `Decimal` (como strings), mas frontend estava enviando números JavaScript:
- `salary_min: 8001` ❌ (deveria ser `"8001"`)
- `salary_max: 12000` ❌ (deveria ser `"12000"`)
- `minimum_years_experience: 5` ❌ (deveria ser `"5"`)

## **Solução Implementada**

### **1. Correção de Operadores por Campo**
**Arquivo: [frontend/src/pages/VagasPage.tsx](frontend/src/pages/VagasPage.tsx)**

#### Alteração 1: Operador padrão por campo
```typescript
// ANTES: Sempre "equals"
onChange={(e) => setNewDealBreaker((db) => ({ ...db, field: e.target.value as any, operator: "equals" }))}

// DEPOIS: Operador válido para o campo
onChange={(e) => {
  const field = e.target.value as any;
  const opMap: Record<string, string[]> = {
    location: ["equals", "not_equals", "contains", "in"],
    work_model: ["equals", "not_equals"],
    education_level: ["equals", ">="],
    experience_years: ["equals", ">=", "<="],
    skill: ["contains", "not_contains"],  // ✅ "skill" reseta para "contains"
    language: ["equals", "contains"],
    availability: ["equals"],
    custom_text: ["contains"],
  };
  const defaultOp = opMap[field]?.[0] ?? "equals";
  setNewDealBreaker((db) => ({ ...db, field, operator: defaultOp }));
}}
```

#### Alteração 2: Validação de operador antes de adicionar
```typescript
function handleAddDealBreaker() {
  // ... validações existentes ...
  
  // ✅ NOVO: Validar que operador é permitido para o campo
  const allowedOps: Record<string, string[]> = {
    location: ["equals", "not_equals", "contains", "in"],
    work_model: ["equals", "not_equals"],
    education_level: ["equals", ">="],
    experience_years: ["equals", ">=", "<="],
    skill: ["contains", "not_contains"],
    language: ["equals", "contains"],
    availability: ["equals"],
    custom_text: ["contains"],
  };
  const field = newDealBreaker.field as string;
  if (allowedOps[field] && !allowedOps[field].includes(newDealBreaker.operator)) {
    setDealBreakerError(`Operador '${newDealBreaker.operator}' não é permitido para o campo '${field}'`);
    return;
  }
}
```

### **2. Conversão de Decimal Fields para Strings**
**Arquivo: [frontend/src/pages/VagasPage.tsx](frontend/src/pages/VagasPage.tsx)**

#### buildCreateJobPayload:
```typescript
// ✅ Converter números para strings para campos Decimal
if (form.minimum_years_experience !== undefined) 
  payload.minimum_years_experience = String(form.minimum_years_experience);
if (form.salary_min !== undefined) 
  payload.salary_min = String(form.salary_min);
if (form.salary_max !== undefined) 
  payload.salary_max = String(form.salary_max);
```

#### buildUpdateJobPayload:
```typescript
// ✅ Mesmo padrão para UPDATE
minimum_years_experience: form.minimum_years_experience !== undefined ? String(form.minimum_years_experience) : null,
salary_min: form.salary_min !== undefined ? String(form.salary_min) : null,
salary_max: form.salary_max !== undefined ? String(form.salary_max) : null,
```

### **3. Atualização de Tipos TypeScript**
**Arquivo: [frontend/src/services/jobsService.ts](frontend/src/services/jobsService.ts)**

```typescript
export type CreateJobRequestPayload = {
  // ...
  minimum_years_experience?: number | string;  // ✅ Aceita string
  salary_min?: number | string;
  salary_max?: number | string;
};

export type UpdateJobRequestPayload = {
  // ...
  minimum_years_experience?: number | string | null;
  salary_min?: number | string | null;
  salary_max?: number | string | null;
};
```

### **4. Logs para Debugging**
**Arquivo: [frontend/src/services/http.ts](frontend/src/services/http.ts)**

```typescript
function resolveError(status: number, payload: unknown): HttpError {
  if (typeof payload === "object" && payload !== null) {
    // Log completo do erro 422 para debugging
    if (status === 422) {
      console.error("[422 Validation Error]", JSON.stringify(payload, null, 2));
    }
    // ...
  }
}
```

**Arquivo: [frontend/src/services/jobsService.ts](frontend/src/services/jobsService.ts)**

```typescript
export async function updateJob(jobId: string, payload: UpdateJobRequestPayload): Promise<Job> {
  console.log("[PATCH /jobs/:id] Payload being sent:", JSON.stringify(payload, null, 2));
  return httpRequest<Job>(`/api/v1/jobs/${jobId}`, { method: "PATCH", body: payload });
}
```

### **5. Teste de Integração**
**Arquivo: [backend/tests/integration/test_job_endpoints.py](backend/tests/integration/test_job_endpoints.py)**

Adicionado novo teste: `test_recruiter_can_edit_job_with_decimal_fields_and_add_skill()`
- ✅ Testa edição com Decimal fields convertidos para strings
- ✅ Testa vinculação de skill após editar vaga
- ✅ Testa edição adicional após adicionar skill

## **Payload Antes vs Depois**

### **ANTES (causa 422):**
```json
{
  "title": "Specialist Lider De IA",
  "description": "...",
  "minimum_years_experience": 5.0,
  "salary_min": 8001,
  "salary_max": 12000.00,
  "deal_breakers": [
    {
      "field": "skill",
      "operator": "equals",  // ❌ INVÁLIDO
      "value": "n8n"
    }
  ]
}
```

### **DEPOIS (correto):**
```json
{
  "title": "Specialist Lider De IA",
  "description": "...",
  "minimum_years_experience": "5.0",
  "salary_min": "8001",
  "salary_max": "12000.00",
  "deal_breakers": [
    {
      "field": "skill",
      "operator": "contains",  // ✅ VÁLIDO
      "value": "n8n"
    }
  ]
}
```

## **Validações Implementadas**

| Campo | Operadores Permitidos | Antes | Depois |
|-------|----------------------|--------|--------|
| `location` | equals, not_equals, contains, in | ✅ | ✅ |
| `work_model` | equals, not_equals | ✅ | ✅ |
| `education_level` | equals, >= | ✅ | ✅ |
| `experience_years` | equals, >=, <= | ✅ | ✅ |
| `skill` | contains, **not_contains** | ❌ equals | ✅ contains |
| `language` | equals, contains | ✅ | ✅ |
| `availability` | equals | ✅ | ✅ |
| `custom_text` | contains | ✅ | ✅ |

## **Fluxo de Correção Completo**

1. ✅ Usuário edita vaga (PATCH)
2. ✅ Seleciona campo "skill" → operador automático = "contains" 
3. ✅ Validação frontend garante operador é válido
4. ✅ Decimal fields convertidos para strings
5. ✅ PATCH enviado com payload correto
6. ✅ Backend valida e aceita
7. ✅ Usuário pode adicionar skill via POST `/jobs/{id}/skills`
8. ✅ Usuário pode editar vaga novamente sem 422

## **Como Testar**

### Frontend:
1. Ir para página de Vagas
2. Editar uma vaga existente
3. Adicionar Deal Breaker com campo "skill"
4. Verificar que operador muda automaticamente para "contains"
5. Salvar e confirmar que não há erro 422
6. No painel de detalhes, adicionar skill e confirmar sucesso

### Console Logs:
```javascript
// Validação frontend
"[422 Validation Error]" // Se houver erro, mostra exatamente o que é

// Operador por campo
"[handleAddDealBreaker]" // Novo log pode ser adicionado aqui

// Payload sendo enviado
"[PATCH /jobs/:id] Payload being sent:" // Mostra exatamente o que está sendo enviado
```

## **Arquivos Modificados**

| Arquivo | Alterações |
|---------|-----------|
| `frontend/src/pages/VagasPage.tsx` | Conversão Decimal para string + Validação operadores + Operador padrão por campo |
| `frontend/src/services/jobsService.ts` | Tipos atualizados + Log do payload |
| `frontend/src/services/http.ts` | Log do erro 422 |
| `backend/tests/integration/test_job_endpoints.py` | Novo teste de edição com skill |

## **Notas Importantes**

⚠️ **Skills não são enviadas no PATCH**: Vinculação de skills usa endpoint separado `POST /jobs/{id}/skills`

⚠️ **Deal Breakers validados rigorosamente**: Cada campo tem operadores específicos permitidos

⚠️ **Decimal Fields requerem strings**: O Pydantic/Python Decimal espera representação em string

✅ **Duplo submit prevenido**: State `setSaving` impede múltiplas requisições simultâneas

## **Resultado Final**

✅ Erro 422 **completamente resolvido**  
✅ Usuários podem editar vagas com deal_breakers de qualquer tipo  
✅ Adição de skills funciona sem conflitos  
✅ Validação frontend previne erros antes de enviar
