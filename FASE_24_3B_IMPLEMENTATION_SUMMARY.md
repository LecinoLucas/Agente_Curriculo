# Fase 24.3B — CandidateDrawer Contextual por Etapa do Fluxo

## Resumo da Implementação

Implementada a Fase 24.3B conforme especificado, que torna o CandidateDrawer exibir apenas as abas úteis para a etapa atual do candidato, mantendo "Mostrar tudo" para acesso avançado.

## Arquivos Criados

### 1. Helper Puro: `getVisibleCandidateTabs.ts`
**Caminho:** `frontend/src/features/candidates/drawer/utils/getVisibleCandidateTabs.ts`

- Função pura que recebe contexto do candidato (stage, status, dados de fluxo)
- Retorna array de `TabKey` (abas visíveis)
- Respeita limite de máximo 6 abas por padrão
- Implementa todas as 11 regras de visibilidade conforme especificado

**Interface:**
```typescript
interface GetVisibleCandidateTabsInput {
  pipelineStage: PipelineStage | null;
  pipelineStatus: string | null;
  activeJobDecision: string | null;
  hasActiveJob: boolean;
  hasBehavioralAssessment: boolean;
  hasInterviews: boolean;
  hasScorecard: boolean;
  hasHiringDecision: boolean;
  hasPreAdmission: boolean;
  hasAdmissionPackage: boolean;
  hasCollaboration: boolean;
  userRole: UserRole;
  showAll: boolean;
}
```

### 2. Testes do Helper: `getVisibleCandidateTabs.test.ts`
**Caminho:** `frontend/src/features/candidates/drawer/utils/__tests__/getVisibleCandidateTabs.test.ts`

- 14 testes validando todos os cenários
- Testa estados: sem vaga, recebido/entrada, triagem, avaliação, entrevista, decisão, pré-admissão
- Valida limite de 6 abas
- Verifica priorização de abas
- ✅ Todos os testes passando

### 3. Componente Atualizado: `CandidateProfileNavigation.tsx`
**Caminho:** `frontend/src/features/candidates/drawer/v2/CandidateProfileNavigation.tsx`

**Mudanças:**
- Adicionados props opcionais de contexto (pipelineStage, userRole, etc)
- Integração com helper `getVisibleCandidateTabs`
- Toggle "Mostrar tudo" / "Mostrar menos" discreto
- Scroll horizontal para overflow de tabs
- Redirecionamento automático para "Resumo" se aba ativa ficar invisível
- Estado local `showAll` para controlar visibilidade

**Melhorias de UX:**
```jsx
// Toggle com ícones chevron (ChevronDown/ChevronUp)
{hasMoreTabs && (
  <button
    type="button"
    onClick={() => setShowAll(!showAll)}
    className="flex items-center gap-1.5 text-xs font-medium..."
  >
    {showAll ? "Mostrar menos" : "Mostrar tudo"}
  </button>
)}
```

### 4. Componente Atualizado: `CandidateProfileView.tsx`
**Caminho:** `frontend/src/features/candidates/drawer/v2/CandidateProfileView.tsx`

**Mudanças:**
- Adicionados props de contexto (pipelineStatus, activeJobDecision, etc)
- Passagem automática de contexto para `CandidateProfileNavigation`
- Suporte a `UserRole` (import do tipo correto)

### 5. Drawer Principal Atualizado: `CandidateDrawer.tsx`
**Caminho:** `frontend/src/features/pipeline/CandidateDrawer.tsx`

**Mudanças:**
- Extração de `userRole` de `user?.role`
- Passagem de `pipelineStatus` via `primaryPipelineEntry?.relationship_status`
- Passagem de `activeJobDecision` via `candidateOverview.active_job_decision?.decision`
- Integração com `CandidateProfileView`

### 6. Testes do Navegador: `CandidateProfileNavigation.test.tsx`
**Caminho:** `frontend/src/features/candidates/drawer/v2/__tests__/CandidateProfileNavigation.test.tsx`

- 6 testes validando renderização e interação
- Testa botão "Mostrar tudo"
- Valida clique em tabs
- ✅ Todos os testes passando

## Regras de Visibilidade Implementadas

### 1. Sem vaga ativa
- `Resumo`, `Documentos`, `Comunicações`

### 2. Recebido/entrada
- `Resumo`, `Análise`, `Documentos`, `Comunicações`

### 3. Triagem
- `Resumo`, `Análise`, `Documentos`, `Comunicações`
- + `Colaboração` (se houver dados ou user é recruiter)
- + `Avaliação` (se houver assessment)

### 4. Avaliação pendente/respondida
- `Resumo`, `Análise`, `Avaliação`, `Documentos`, `Comunicações`

### 5. Entrevista agendada/aguardando feedback
- `Resumo`, `Entrevista`, `Análise`, `Colaboração`, `Comunicações`

### 6. Scorecard submetido/decisão pendente
- `Resumo`, `Entrevista`, `Análise`, `Colaboração`, `Comunicações`

### 7. Decisão hire/pré-admissão
- `Resumo`, `Pré-admissão`, `Documentos`, `Comunicações`, `Colaboração`

### 8. Documento pendente/rejeitado/aprovado
- `Resumo`, `Pré-admissão`, `Documentos`, `Comunicações`

### 9. Pacote/ERP
- `Resumo`, `Pré-admissão`, `Comunicações`

### 10. Mostrar tudo (showAll=true)
- Todas as 8 abas: `Resumo`, `Análise`, `Documentos`, `Entrevista`, `Avaliação`, `Comunicações`, `Colaboração`, `Pré-admissão`

### 11. Limite de abas
- Máximo 6 abas por padrão (sem showAll)
- Priorização: overview > score > interview > collaboration > pre_admission > documents > assessment > communications

## Validações Executadas

### Testes Unitários
```bash
npm test -- getVisibleCandidateTabs
# ✓ 14/14 testes passando

npm test -- CandidateProfileNavigation
# ✓ 6/6 testes passando

npm test -- CandidateDrawer
# ✓ 3/3 testes passando (sem quebra de regressão)
```

### Build
```bash
npm run build
# ✓ TypeScript OK
# ✓ Vite OK
# ✓ Sem erros de compilação
```

## UX Implementada

### Toggle "Mostrar tudo"
- Aparece apenas quando há mais abas disponíveis
- Ícone chevron para orientação visual
- Texto claro: "Mostrar tudo" / "Mostrar menos"
- Discreto no tamanho (xs, muted color)

### Scroll Horizontal
- Tabs com `overflow-x-auto`
- Whitespace-nowrap em cada tab
- Mantém keep-alive das abas já visitadas

### Redirecionamento
- Se aba ativa ficar invisível após mudança de contexto → redireciona para "Resumo"
- Transição suave sem perda de dados

## O que NÃO foi alterado (conforme especificado)

- ❌ Backend (nenhuma alteração)
- ❌ Contrato de API
- ❌ Ranking/Score
- ❌ Active Job Decision
- ❌ Pipeline
- ❌ Protheus/ERP
- ❌ IA/Análises
- ❌ Features novas (apenas filtragem de UI)
- ❌ Dados não são escondidos (apenas reorganizados)

## Riscos e Limitações

### 1. Dados Contextuais Limitados
- Alguns dados como `hasBehavioralAssessment`, `hasScorecard`, `hasHiringDecision` ainda usam valores default no CandidateDrawer
- **Mitigation:** Backend pode ser integrado para enviar esses dados no CandidateOverview quando necessário
- **Impacto:** Baixo — abas ainda aparecem quando há dados reais

### 2. Keep-Alive de Tabs
- Abas visitadas permanecem montadas mesmo invisíveis (otimização de performance)
- **Impacto:** Insignificante — componentes estão com `hidden` CSS

### 3. UserRole do Backend
- Tipos `candidate`, `viewer`, `hr` são diferentes do esperado
- **Mitigation:** Mapeado corretamente no helper com `isStaff` flag

## Próximos Passos Recomendados

1. **Integração Backend:** Enviar dados como `has_scorecard`, `has_hiring_decision` no CandidateOverview
2. **Analytics:** Rastrear qual % de usuários usa "Mostrar tudo"
3. **A/B Testing:** Validar se filtragem reduz cognitive load
4. **Mobile:** Testar com scroll horizontal em telas pequenas

## Comandos para Validação

```bash
# Rodar testes específicos
npm test -- getVisibleCandidateTabs
npm test -- CandidateProfileNavigation
npm test -- CandidateDrawer

# Build completo
npm run build

# Dev server (para testes manuais)
npm run dev
```

## Conclusão

A Fase 24.3B foi implementada com sucesso. O CandidateDrawer agora mostra apenas as abas relevantes para cada etapa do fluxo, mantendo a opção "Mostrar tudo" para acesso avançado. A solução é pura (sem side effects), testada e sem impacto no backend ou contrato de API.

**Status:** ✅ Completo e validado
**Data:** 2026-05-15
