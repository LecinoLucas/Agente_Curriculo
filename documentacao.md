# Documentação Técnica — Fase 1: Compliance, Idempotência e Segurança

> Projeto: **Admissão RH / Resume AI System**  
> Data base: **2026-05-18**  
> Objetivo: transformar os achados críticos da auditoria em um plano executável, seguro e revisável para outra IA implementar sem quebrar regras canônicas do sistema.

---

## 1. Contexto

O sistema Admissão RH é um ATS com IA para gestão de candidatos, vagas, análises, pipeline, score, entrevistas, documentos, admissões e área administrativa.

A arquitetura atual usa:

- **Backend:** FastAPI, SQLAlchemy async, PostgreSQL, Redis, Celery, Alembic.
- **Frontend:** React, TypeScript, Vite, Tailwind, shadcn/ui.
- **IA:** Claude e Gemini, com prompts versionados e workers assíncronos.
- **Domínios críticos:** candidatos, vagas, análise IA, ranking, pipeline, documentos, portal do candidato e admissão.

A auditoria técnica identificou riscos prioritários envolvendo:

- vazamento de arquivos e dados pessoais;
- idempotência frágil em análises e eventos de pipeline;
- concorrência com workers IA;
- risco de custo duplicado com LLM;
- exposição indevida de dados internos no portal do candidato;
- múltiplos prompts ativos do mesmo tipo;
- uso futuro de código legado no frontend.

Esta documentação define a **Fase 1**, focada em corrigir a base antes de qualquer melhoria visual ou refatoração estrutural.

---

## 2. Princípio da Fase 1

A Fase 1 não é uma fase estética.

Ela existe para proteger o sistema contra:

1. **vazamento de dados pessoais;**
2. **histórico de pipeline incorreto;**
3. **reaproveitamento errado de análise IA;**
4. **gasto duplicado de tokens por concorrência;**
5. **portal do candidato expondo campos internos;**
6. **prompts inconsistentes em produção;**
7. **retorno acidental de código legado.**

Se essa base estiver errada, qualquer tela bonita por cima vira maquiagem.

---

## 3. Escopo Oficial da Fase 1

A Fase 1 cobre os seguintes riscos da auditoria:

| Código | Tema | Gravidade | Prioridade |
|---|---|---:|---:|
| R13 | LGPD, CPF e arquivos públicos em `/uploads` | Crítico | 1 |
| R07 | `analysis.idempotency_key` sem namespace forte | Crítico | 2 |
| R08 | Eventos de pipeline com colisão em transições repetidas | Alto | 3 |
| R11 | Workers IA podendo chamar LLM duplicado | Alto | 4 |
| R14 | Portal do candidato com risco de expor campos internos | Alto | 5 |
| R19 | Mais de um prompt ativo por `template_type` | Médio | 6 |
| R06 | Imports futuros de `frontend/src/legacy` | Médio | 7 |

---

## 4. Fora do Escopo

A IA implementadora **não deve** mexer em:

- fórmula de score;
- pesos canônicos;
- ranking;
- telas visuais da pipeline;
- layout do frontend;
- strings de status existentes;
- schema JSONB removendo campos;
- prompts ativos sem nova versão;
- coluna `cpf` removendo dado antigo;
- `task_acks_late=True` do Celery;
- estados canônicos de análise, pipeline, vaga, candidato ou admissão.

---

## 5. Ordem Recomendada de Execução

A execução deve ser feita em subfases pequenas:

```text
Fase 1A — LGPD e portal do candidato
R13 + R14

Fase 1B — Idempotência e custo de IA
R07 + R11

Fase 1C — Histórico auditável da pipeline
R08

Fase 1D — Prompt ativo único e bloqueio de legado
R19 + R06
```

Essa divisão reduz risco de diff grande e facilita revisão.

---

# Fase 1A — LGPD e Portal do Candidato

## 6. R13 — LGPD, CPF e Arquivos Públicos

### Problema

O sistema possui risco de exposição direta de arquivos via `/uploads` e CPF armazenado em texto completo.

Risco principal:

- qualquer pessoa com o caminho do arquivo pode tentar baixar um PDF;
- currículo pode conter CPF, telefone, endereço, histórico profissional e outros dados pessoais;
- CPF em texto plano dificulta evolução para uma postura mínima de LGPD.

### Objetivo

Proteger arquivos e preparar o banco para leitura futura por hash de CPF sem quebrar o sistema atual.

### Arquivos prováveis

- `backend/src/interface/api/main.py`
- `backend/src/interface/api/routers/resumes.py`
- `backend/src/interface/api/routers/candidates.py`
- `backend/src/infrastructure/database/models/candidate_model.py`
- `backend/src/infrastructure/storage/resume_files.py`
- `backend/alembic/versions/*`
- `backend/scripts/*`

### Mudanças permitidas

1. Verificar se existe exposição direta:

```python
app.mount("/uploads", StaticFiles(...))
```

2. Remover ou neutralizar exposição pública direta de `/uploads`.

3. Garantir endpoint autenticado para download:

```text
GET /api/v1/candidates/{candidate_id}/resume/download
```

ou endpoint equivalente já existente.

4. Validar permissão antes de entregar o arquivo.

5. Retornar arquivo por `StreamingResponse` ou mecanismo equivalente.

6. Criar migration adicionando:

```text
cpf_hash TEXT NULL
cpf_last4 VARCHAR(4) NULL
```

7. Criar script separado de backfill, por exemplo:

```text
backend/scripts/backfill_candidate_cpf_hash.py
```

### Mudanças proibidas

- Não remover a coluna `cpf` agora.
- Não rodar backfill automaticamente dentro da migration.
- Não mudar fluxo de upload.
- Não quebrar download autenticado já existente.
- Não expor storage path no JSON da API.

### Critérios de aceite

- `/uploads/<arquivo>` não fica mais público.
- Download autenticado continua funcionando.
- Usuário sem permissão não baixa currículo.
- Migration cria `cpf_hash` e `cpf_last4` sem perda de dados.
- Backfill fica separado, explícito e manual.

### Testes obrigatórios

```text
1. GET /uploads/arquivo.pdf sem autenticação deve retornar 404 ou rota inexistente.
2. GET endpoint autenticado de download deve retornar 200 para usuário autorizado.
3. GET endpoint autenticado de download deve retornar 403/404 para usuário sem permissão.
4. Migration deve aplicar e reverter em ambiente de teste.
5. Script de backfill deve ser testável sem rodar automaticamente.
```

### Comandos sugeridos

```bash
cd backend
./.venv/bin/pytest tests/integration -k "resume or candidate or download"
./.venv/bin/alembic upgrade head
```

---

## 7. R14 — Whitelist no Portal do Candidato

### Problema

O portal do candidato não pode expor campos internos do RH por serialização acidental.

Campos proibidos incluem:

```text
internal_notes
archived_by
archive_reason
data_quality_reason
deleted_at
cpf completo
dados internos de score/admin
```

### Objetivo

Garantir que respostas públicas do portal sejam construídas por whitelist explícita, nunca por serialização cega do model.

### Arquivos prováveis

- `backend/src/application/services/candidate_portal_service.py`
- `backend/src/interface/api/routers/public.py`
- `backend/src/interface/api/schemas/candidate_portal_schemas.py`
- `backend/src/interface/api/schemas/*`
- `backend/tests/integration/*candidate_portal*`

### Mudanças permitidas

- Revisar schemas públicos do portal.
- Substituir qualquer `.from_orm()` perigoso por montagem explícita.
- Criar teste de contrato do JSON.
- Garantir que CPF completo não aparece no portal.

### Mudanças proibidas

- Não alterar schema admin.
- Não remover campos do backend interno.
- Não mudar fluxo de login do candidato.
- Não mexer no CandidatePreviewDrawer ou workspace admin.

### Critérios de aceite

O JSON do portal do candidato nunca deve conter campos internos, mesmo se o model possuir esses dados preenchidos.

### Testes obrigatórios

```text
1. Criar candidato com internal_notes, archive_reason, data_quality_reason e cpf.
2. Autenticar como candidato.
3. Chamar overview/profile do portal.
4. Validar ausência das chaves proibidas.
5. Validar presença apenas dos campos públicos esperados.
```

---

# Fase 1B — Idempotência e Custo de IA

## 8. R07 — Idempotency Key de Análise com Namespace

### Problema

A chave `analyses.idempotency_key` é única globalmente. Se a construção da chave não incluir contexto suficiente, análises diferentes podem colidir ou reaproveitar resultado indevido.

### Objetivo

Criar uma função pura e determinística para chaves novas, com namespace e campos relevantes.

### Arquivos prováveis

- `backend/src/application/services/analysis_dispatch_service.py`
- `backend/src/infrastructure/database/models/analysis_model.py`
- `backend/tests/unit/*analysis_dispatch*`
- `backend/tests/integration/*analysis*`

### Formato recomendado

```text
analysis:v1:{resume_version_id}:{job_id_or_null}:{ai_model_id}:{prompt_template_id_or_version}:{requested_by_or_system}
```

### Função esperada

```python
def build_analysis_idempotency_key(
    *,
    resume_version_id: UUID,
    job_id: UUID | None,
    ai_model_id: UUID | str,
    prompt_template_id: UUID | str | None,
    requested_by: UUID | str | None,
) -> str:
    ...
```

### Mudanças permitidas

- Criar função pura.
- Usar a nova função apenas para novas análises.
- Manter chaves antigas válidas.
- Adicionar testes de colisão.

### Mudanças proibidas

- Não migrar ou reescrever chaves antigas.
- Não mudar a constraint unique existente.
- Não alterar status de análise.
- Não alterar prompt ativo.

### Critérios de aceite

- Mesmos inputs geram mesma chave.
- Inputs diferentes geram chaves diferentes.
- 1000 combinações não colidem.
- Requisição repetida reutiliza a mesma análise.

### Testes obrigatórios

```text
1. test_build_analysis_idempotency_key_is_deterministic
2. test_build_analysis_idempotency_key_changes_when_job_changes
3. test_build_analysis_idempotency_key_changes_when_prompt_changes
4. test_build_analysis_idempotency_key_has_no_collision_for_many_inputs
5. test_dispatch_reuses_existing_analysis_for_same_key
```

---

## 9. R11 — Claim Antes da Chamada IA

### Problema

Com `task_acks_late=True`, uma task pode rodar mais de uma vez em caso de crash, timeout ou concorrência. Se dois workers chamarem Claude/Gemini para a mesma análise, o sistema paga tokens duplicados.

### Objetivo

Garantir que somente um worker pode chamar o provider IA para uma análise.

### Arquivos prováveis

- `backend/src/interface/workers/analysis_tasks.py`
- `backend/src/application/services/analysis_service.py`
- `backend/src/application/services/analysis_dispatch_service.py`
- `backend/src/infrastructure/queue/celery_app.py`
- `backend/tests/integration/*analysis*`

### Mudanças permitidas

- Validar status e claim antes da chamada IA.
- Usar transação para marcar `processing` e `worker_claim_id`.
- Abort sem chamar provider se outra execução já reivindicou.
- Adicionar log estruturado para skip.

### Mudanças proibidas

- Não remover `task_acks_late=True`.
- Não remover retry.
- Não simplificar máquina de estados.
- Não alterar contrato do provider IA.

### Critérios de aceite

- Duas execuções concorrentes para a mesma análise resultam em apenas uma chamada IA.
- A outra execução encerra com skip seguro.
- A análise termina em estado consistente.

### Testes obrigatórios

```text
1. Simular dois workers concorrentes com asyncio.gather.
2. Mockar provider IA e contar chamadas.
3. Esperado: provider chamado exatamente 1 vez.
4. Esperado: uma execução processa, a outra aborta sem erro fatal.
```

---

# Fase 1C — Histórico Auditável da Pipeline

## 10. R08 — Eventos de Pipeline com Sequência

### Problema

A chave atual de evento pode colidir em transições repetidas. Exemplo:

```text
screening → hr_interview → screening → hr_interview
```

A segunda ida para `hr_interview` pode gerar a mesma idempotency key da primeira.

### Objetivo

Permitir eventos repetidos legítimos sem quebrar idempotência de retries reais.

### Arquivos prováveis

- `backend/src/application/services/pipeline_service.py`
- `backend/src/infrastructure/database/models/candidate_job_pipeline_model.py`
- `backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py`
- `backend/alembic/versions/*`
- `backend/tests/integration/test_pipeline_*`

### Mudança recomendada

Adicionar uma coluna:

```text
transition_seq INTEGER NULL
```

E estender novas chaves para incluir sequência:

```text
pipeline:v2:{pipeline_id}:{event_type}:{from_stage}:{to_stage}:{actor_id}:{transition_seq}
```

### Importante

Eventos antigos devem continuar válidos. Não reescrever histórico existente.

### Mudanças permitidas

- Criar migration para `transition_seq`.
- Calcular próxima sequência por `pipeline_id`.
- Usar novo formato somente para eventos novos.
- Manter leitura do histórico compatível com eventos antigos.

### Mudanças proibidas

- Não apagar eventos antigos.
- Não alterar nomes de estágios.
- Não alterar `STAGE_CONFIG`.
- Não alterar UI da pipeline.
- Não mudar semântica de terminal/hired/rejected.

### Critérios de aceite

A sequência abaixo deve persistir 4 eventos:

```text
entry → screening
screening → hr_interview
hr_interview → screening
screening → hr_interview
```

### Testes obrigatórios

```text
1. Criar pipeline.
2. Mover A→B.
3. Mover B→A.
4. Mover A→B novamente.
5. Validar que o histórico tem todos os eventos.
6. Validar que não houve IntegrityError.
7. Validar ordenação cronológica.
```

---

# Fase 1D — Prompt Ativo Único e Bloqueio de Legacy

## 11. R19 — Prompt Template Ativo Único

### Problema

`prompt_templates.is_active` não garante que exista apenas uma versão ativa por `template_type`.

Isso pode causar análises diferentes para o mesmo cenário.

### Objetivo

Garantir no banco e no service que só exista um prompt ativo por tipo.

### Arquivos prováveis

- `backend/src/infrastructure/database/models/analysis_model.py`
- `backend/src/application/services/ai_admin_service.py`
- `backend/alembic/versions/*`
- `backend/tests/integration/*prompt*`
- `backend/tests/unit/*ai_admin*`

### Migration esperada

Criar índice unique parcial:

```sql
UNIQUE(template_type) WHERE is_active = true
```

### Service esperado

Ao ativar um prompt:

1. abrir transação;
2. desativar prompts ativos do mesmo `template_type`;
3. ativar o prompt escolhido;
4. commitar.

### Mudanças proibidas

- Não remover unique `(name, version)` existente.
- Não editar prompt ativo diretamente sem versionamento.
- Não alterar `prompt_version_used` histórico.

### Critérios de aceite

- Não é possível ter duas versões ativas do mesmo `template_type`.
- Ativar nova versão desativa a anterior dentro da mesma transação.

### Testes obrigatórios

```text
1. Criar dois prompt_templates do mesmo template_type.
2. Ativar o primeiro.
3. Ativar o segundo.
4. Validar que o primeiro ficou inactive e o segundo active.
5. Tentar forçar dois active no banco e esperar IntegrityError.
```

---

## 12. R06 — Bloqueio de Imports de Legacy no Frontend

### Problema

A pasta `frontend/src/legacy` existe, mas sem barreira técnica. Outra IA pode importar código antigo e reintroduzir comportamento legado.

### Objetivo

Congelar legacy e impedir novos imports.

### Arquivos prováveis

- `frontend/src/legacy/README.md`
- `frontend/eslint.config.*`
- `frontend/package.json`
- `frontend/src/**/*`

### Mudanças permitidas

1. Rodar busca:

```bash
grep -R "from .*legacy\|from ['\"]@/legacy\|from ['\"].*/legacy" frontend/src
```

2. Se não houver imports legítimos, adicionar regra ESLint:

```js
"no-restricted-imports": [
  "error",
  {
    "patterns": [
      "@/legacy/*",
      "../legacy/*",
      "../../legacy/*",
      "src/legacy/*"
    ]
  }
]
```

3. Criar README:

```md
# Legacy

Código congelado. Não crie novos imports a partir desta pasta.
Qualquer remoção ou migração deve acontecer em fase própria, com testes e diff pequeno.
```

### Mudanças proibidas

- Não apagar a pasta legacy agora.
- Não refatorar código legacy agora.
- Não alterar comportamento visual.

### Critérios de aceite

- Build continua passando.
- Lint bloqueia novo import de legacy.
- README documenta a regra.

### Comandos sugeridos

```bash
cd frontend
npm run build
npm run lint
```

---

## 13. Prompt Oficial para Outra IA Implementar a Fase 1

```text
Você é uma IA implementadora sênior trabalhando no sistema Admissão RH / Resume AI System.

Contexto:
Recebi uma auditoria crítica com 20 riscos técnicos. Quero implementar apenas a FASE 1, com foco em compliance, idempotência, segurança de IA e proteção contra legado.

NÃO faça reescrita geral.
NÃO mexa em score, ranking, fórmula de pesos, estados canônicos ou pipeline visual.
NÃO misture refatoração estética.
NÃO altere strings de status existentes.

Objetivo da Fase 1:
Corrigir riscos prioritários sem quebrar comportamento atual.

Escopo da Fase 1:

1. R13 — LGPD/PDF/CPF
- Verificar se existe app.mount("/uploads", StaticFiles(...)).
- Se existir, remover exposição pública direta de uploads.
- Criar ou reforçar endpoint autenticado para download de currículo/documento.
- O endpoint deve validar permissão antes de devolver arquivo.
- Se já existir GET /candidates/{id}/resume/download, reutilizar padrão.
- Adicionar teste: GET /uploads/<arquivo>.pdf sem auth deve retornar 404 ou não existir.
- Adicionar teste: download autenticado continua funcionando.
- Preparar migration para cpf_hash e cpf_last4, sem remover cpf ainda.
- Criar script de backfill separado se necessário, mas NÃO rodar backfill automaticamente na migration.

2. R14 — Whitelist do portal do candidato
- Revisar CandidatePortalOverviewResponse e endpoints públicos do portal.
- Garantir que não usem serialização cega do model.
- O JSON do candidato no portal nunca pode conter internal_notes, archived_by, archive_reason, data_quality_reason, deleted_at, cpf completo ou dados internos de score/admin.
- Adicionar teste de contrato para o JSON do portal.

3. R07 — Idempotency key de análise com namespace
- Localizar construção atual de analyses.idempotency_key.
- Criar função pura build_analysis_idempotency_key(...).
- Formato sugerido: analysis:v1:{resume_version_id}:{job_id_or_null}:{ai_model_id}:{prompt_template_id_or_version}:{requested_by_or_system}
- Mesmos inputs devem gerar mesma chave.
- Inputs diferentes devem gerar chaves diferentes.
- Não alterar chaves antigas já gravadas.
- Novas análises devem usar o novo formato.
- Testar 1000 combinações sem colisão.
- Testar que mesma combinação reaproveita a mesma análise.

4. R11 — Claim antes da chamada IA
- Revisar process_analysis em analysis_tasks.py e o fluxo de claim.
- Garantir que antes de chamar Claude/Gemini o worker valide status/claim de forma transacional.
- Se outra execução já reivindicou a análise, abortar sem chamar IA.
- Não remover task_acks_late=True.
- Adicionar teste concorrente simulando dois workers tentando processar a mesma analysis.
- Critério: apenas um chama o provider IA.

5. R08 — Eventos da pipeline com sequência
- Localizar _build_event_idempotency_key.
- Não reescrever chaves antigas.
- Estender o formato para novas transições recorrentes usando transition_seq ou mecanismo equivalente.
- Garantir que sequência A→B→A→B persista 4 eventos, não 2.
- Criar migration se precisar adicionar transition_seq.
- Manter compatibilidade com eventos antigos.
- Adicionar teste de histórico da pipeline.

6. R19 — Prompt template ativo único
- Adicionar índice unique parcial UNIQUE(template_type) WHERE is_active = true.
- Ajustar serviço de ativação de prompt para desativar prompts ativos do mesmo template_type antes de ativar o novo, na mesma transação.
- Manter unique(name, version) existente.
- Testar que não existem duas versões ativas do mesmo tipo.

7. R06 — Bloquear imports de legacy no frontend
- Rodar busca por imports de frontend/src/legacy.
- Se não houver uso legítimo, adicionar regra ESLint no-restricted-imports bloqueando src/legacy/*.
- Criar README em frontend/src/legacy explicando que é código congelado e não deve receber novos imports.
- Garantir npm run build passando.

Regras rígidas:
- Faça diffs pequenos por risco.
- Depois de cada risco, rode testes específicos.
- Não corrija problemas fora do escopo.
- Não renomeie status.
- Não altere fórmula de score.
- Não altere prompt ativo sem nova versão.
- Não remova coluna cpf agora.
- Não faça backfill automático dentro da migration.
- Não altere contratos públicos do frontend exceto para remover vazamento sensível.

Entrega final obrigatória:
1. Arquivos alterados por risco.
2. Migrations criadas.
3. Testes adicionados.
4. Comandos executados.
5. Riscos que ficaram pendentes.
6. Confirmação de que score/ranking/pipeline visual não foram alterados.
```

---

## 14. Checklist de Revisão da Fase 1

Antes de aceitar a entrega da IA, revisar:

```text
[ ] /uploads não está público.
[ ] Download autenticado funciona.
[ ] Candidato sem permissão não baixa arquivo.
[ ] cpf_hash e cpf_last4 existem.
[ ] cpf antigo não foi removido.
[ ] Backfill não roda automaticamente.
[ ] Portal do candidato não expõe campos internos.
[ ] Idempotency key nova tem namespace analysis:v1.
[ ] Chaves antigas continuam válidas.
[ ] Duas execuções concorrentes chamam IA apenas uma vez.
[ ] Pipeline A→B→A→B gera todos os eventos.
[ ] Prompt_templates tem índice unique parcial por template_type ativo.
[ ] Ativar prompt novo desativa o anterior.
[ ] Imports de legacy estão bloqueados.
[ ] Build frontend passa.
[ ] Testes backend específicos passam.
[ ] Score/ranking/fórmula não foram alterados.
[ ] Pipeline visual não foi alterada.
[ ] Strings de status não foram renomeadas.
```

---

## 15. Comandos de Validação Sugeridos

Backend:

```bash
cd backend
./.venv/bin/alembic upgrade head
./.venv/bin/pytest tests/integration -k "candidate or resume or download or portal"
./.venv/bin/pytest tests/integration -k "analysis or idempotency or pipeline or prompt"
./.venv/bin/pytest tests/unit -k "idempotency or prompt or portal"
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
```

Busca manual:

```bash
grep -R "app.mount(.*uploads" backend/src || true
grep -R "from .*legacy\|@/legacy\|src/legacy" frontend/src || true
grep -R "score_model\|_CANONICAL\|_build_score_input_hash" backend/src/application/services || true
```

---

## 16. Critério de Pronto

A Fase 1 só pode ser considerada concluída quando:

1. todos os testes novos passarem;
2. migrations aplicarem limpo;
3. frontend buildar;
4. não houver alteração em score/ranking;
5. não houver alteração visual na pipeline;
6. não houver vazamento público de arquivos;
7. portal do candidato estiver protegido por whitelist;
8. concorrência de worker não duplicar chamada IA;
9. histórico de pipeline preservar transições repetidas;
10. prompt ativo único estiver garantido no banco.

---

## 17. Nota Final

Esta fase deve ser tratada como fundação de segurança e consistência.  
Não é o momento de melhorar layout, criar BI, alterar score ou reorganizar páginas gigantes.

Depois da Fase 1, a próxima etapa recomendada é a **Fase 2 — Refatoração Estrutural e Observabilidade**, atacando:

- `analysis_service.py` grande demais;
- `pipeline_service.py` concentrando invariantes;
- `candidate_ranking_service.py` acoplado;
- páginas frontend gigantes;
- parser LLM sem fixtures;
- drift de `score_model_version`;
- heartbeat do Celery Beat;
- schema formal para `extracted_data`.
