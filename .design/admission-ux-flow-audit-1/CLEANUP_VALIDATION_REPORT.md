# CLEANUP VALIDATION REPORT — ADMISSION-CLEANUP-VALIDATION-1

**Data:** 2026-06-16  
**Tipo:** Cleanup / validação final / safe-first  
**Resultado final:** `PASS_WITH_NOTES`

## 1. Status do `PreAdmissionChecklist.tsx`

O arquivo `frontend/src/features/candidates/drawer/components/PreAdmissionChecklist.tsx` foi investigado por busca de imports, uso em JSX, rotas e páginas ativas.

### Evidência de orfandade

- Busca por `PreAdmissionChecklist` não retornou nenhum import ativo do componente.
- Busca por `from .*PreAdmissionChecklist`, `import .*PreAdmissionChecklist` e `<PreAdmissionChecklist` não retornou uso ativo.
- `AppRouter` e páginas ativas não referenciam esse componente.
- O arquivo tinha comentário prévio de depreciação dizendo que não era renderizado em nenhuma rota ativa.

## 2. Removido ou mantido

**Status:** removido.

### Ação aplicada

- Removido: `frontend/src/features/candidates/drawer/components/PreAdmissionChecklist.tsx`

### Validação após remoção

- `frontend`: `npx tsc --noEmit`
  - Resultado: `TypeScript: No errors found`
- `frontend`: `npx vitest run src/pages/__tests__/AdmissionCasePage.test.tsx`
  - Resultado: `PASS (53) FAIL (0)`
- `frontend`: `npx vitest run src/pages/__tests__/PreAdmissionChecklistsPage.test.tsx`
  - Resultado: `PASS (10) FAIL (0)`

Conclusão: a remoção é segura e não afetou rotas ativas nem o build TypeScript do frontend.

## 3. Testes backend executados

Os testes backend passaram a rodar corretamente quando executados com o `cwd` em `backend/`, permitindo que o `SettingsConfigDict(env_file=".env")` carregasse `backend/.env`.

### Comandos executados

- `cd backend && .venv/bin/python -m pytest tests/integration/test_admission_case_workspace.py`
- `cd backend && .venv/bin/python -m pytest tests -k "admission or pre_admission"`

## 4. Resultado dos testes

### Teste focado

- `tests/integration/test_admission_case_workspace.py`
  - Resultado: `19 passed`

Esse arquivo cobre, entre outros pontos relevantes desta frente:
- workspace admissional;
- rejeição/correção com `rejection_reason_public`;
- estados do Protheus no workspace.

### Suíte ampla com filtro `admission or pre_admission`

- Resultado: `225 passed, 3 failed, 3163 deselected`

### Falhas encontradas

1. `tests/e2e/test_full_ats_flow.py::test_admission_package_validation_blocks_with_pending_docs`
   - Falha ao publicar vaga por nova exigência de `behavioral_template_id`.
   - O erro retornado foi `422 job_publication_validation_failed`.
   - Indício forte de falha fora do escopo desta limpeza de UX da admissão.

2. `tests/integration/test_communication_event_integrations.py::test_pre_admission_and_document_events_create_safe_communications`
   - Falha em helper de criação de hire decision com `headers` em formato incorreto.
   - Pela stack trace, há passagem de tupla com `UUID` + headers para `httpx.Headers`.
   - Também parece fora do escopo desta limpeza.

3. `tests/integration/test_communication_event_integrations.py::test_admission_package_approved_creates_communication`
   - Mesmo grupo de falha da suíte de comunicação/integrations.
   - Também fora do escopo da frente ADMISSION-UX.

## 5. Variáveis/env usadas ou ausentes

### Variáveis que faltaram na tentativa anterior

Na tentativa anterior, o backend foi executado a partir do diretório raiz do repositório, e o `.env` do backend não foi carregado. As variáveis reportadas como ausentes foram:

- `APP_SECRET_KEY`
- `DATABASE_URL`
- `JWT_SECRET_KEY`

### Como foi resolvido

- Os testes foram rerodados com `cd backend && ...`, o que permitiu carregar `backend/.env` corretamente.

### Situação final

- Não foi necessário alterar código nem criar env novo.
- Não foi necessário usar Docker.
- O problema era apenas contexto de execução/cwd.

## 6. Resultado da revisão visual

**Status:** `SKIPPED`

### Motivo

- Nesta sessão não havia ferramenta de browser/screenshot disponível para abrir o app local e validar visualmente o fluxo do RH e do candidato.
- A validação visual ficou restrita a leitura estrutural de código, testes e artefatos já existentes.

## 7. Riscos restantes

1. A revisão visual mínima ainda não foi executada em browser real nesta sessão.
2. A suíte ampla filtrada por `admission or pre_admission` ainda possui 3 falhas, mas elas não apontam regressão introduzida por esta limpeza do fluxo de admissão.
3. O resultado final permanece com notas porque a estabilidade da área “admission/pre_admission” como um todo não está 100% verde no filtro amplo.

## 8. Recomendação final

**Resultado recomendado:** `PASS_WITH_NOTES`

### Justificativa

- O cleanup residual da frente ADMISSION-UX foi concluído com sucesso.
- O componente legado foi removido de forma segura.
- O teste backend focal da área central (`test_admission_case_workspace.py`) passou integralmente.
- O problema de ambiente foi esclarecido e resolvido sem alterar regra de negócio.
- Permanecem apenas notas externas ao escopo imediato:
  - validação visual em browser não executada;
  - 3 falhas em suíte ampla que merecem triagem separada.
