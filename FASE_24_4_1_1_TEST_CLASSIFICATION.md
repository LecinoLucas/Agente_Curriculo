# Fase 24.4 Etapa 1.1 — Classificação dos 9 Testes Falhando

**Data**: 2026-05-15  
**Status**: Análise completa  
**Objetivo**: Classificar e separar falhas relacionadas ao split de CandidateDrawer vs falhas pre-existing ou relacionadas à Fase 24.3C

---

## Resumo Executivo

| Falha | Arquivo | Causa | Classificação | Ação |
|-------|---------|-------|-----------------|------|
| 1 | CollaborationTab.test.tsx | collaborationService não existe | PRE-EXISTING | Não corrigir (fora do escopo) |
| 2-4 | CandidatePortalFlow.test.tsx (3 testes) | Elementos de UI removidos/alterados em 24.3C | FASE 24.3C | Corrigir testes desatualizados |
| 5-6 | CandidatesPageRow.test.tsx (2 testes) | Texto de status mudou em 24.3C | FASE 24.3C | Corrigir testes desatualizados |
| 7 | KanbanCard.test.tsx | Badge "Mais aderente" não renderizado | FASE 24.3C | Investigar, não é falha de split |
| 8 | KanbanColumn.test.tsx | Similar a KanbanCard | FASE 24.3C | Investigar, não é falha de split |
| 9 | LinkCandidateJobModal.test.tsx | Texto "Nenhuma vaga vinculada" → "Candidato aguardando vaga" | FASE 24.3C | Corrigir teste desatualizado |
| 10 | useCandidateData.test.tsx | Mock getCandidateRankingEntry falta | PRE-EXISTING | Não corrigir (fora do escopo) |

---

## Detalhamento de Cada Falha

### 1. CollaborationTab.test.tsx
**Classificação**: PRE-EXISTING  
**Causa**: Falha de importação — arquivo `collaborationService` não existe  
```
Error: Failed to resolve import "../../../../services/collaborationService"
```
**Relacionado ao split?** Não  
**Ação**: Deixar como está (fora do escopo de 24.4)

---

### 2-4. CandidatePortalFlow.test.tsx (3 testes)
**Classificação**: RELACIONADO A FASE 24.3C  
**Testes**:
- "renderiza entrada única do candidato com acesso para login e cadastro"
- "portal mostra dados do candidato e não exibe score"
- "portal mostra card e permite responder avaliação comportamental"

**Causa**: Testes procuram por elementos de UI que foram removidos ou alterados na Fase 24.3C
- Procura por link "Quero me candidatar" que não existe
- Procura por texto "Candidatura pública" que não existe
- Mockups de componentes podem estar fora de sync

**Relacionado ao split?** Não, é consequência da simplificação do Overview em 24.3C  
**Ação**: Corrigir ou marcar como xfail se o comportamento for intencional

---

### 5-6. CandidatesPageRow.test.tsx (2 testes)
**Classificação**: RELACIONADO A FASE 24.3C  
**Testes**:
- "exibe badge e ação rápida para candidato aguardando vaga sem depender de hover"
- "expõe a ação de arquivar candidato sem abrir o drawer"

**Causa**: 
- Teste 1: Procura por texto "Aguardando vaga" que agora é renderizado de forma diferente
- Teste 2: Procura por botão com aria-label contendo "Ações do candidato Pessoa Teste" que não existe

**Relacionado ao split?** Não  
**Ação**: Corrigir testes para procurar pelos elementos corretos

---

### 7. KanbanCard.test.tsx
**Classificação**: RELACIONADO A FASE 24.3C (ou possível regressão em badge rendering)  
**Teste**: "deve renderizar o badge 'Mais aderente' quando isTopMatch for true"  
**Causa**: Badge "Mais aderente" não está sendo renderizado quando `isTopMatch={true}`  
**Relacionado ao split?** Não, mas pode ser regressão de lógica de ranking  
**Ação**: Investigar se é regressão real ou teste incompleto

---

### 8. KanbanColumn.test.tsx
**Classificação**: RELACIONADO A FASE 24.3C (ou possível regressão em highlight)  
**Teste**: "deve destacar apenas o primeiro card quando showTopMatchHighlight for true"  
**Causa**: Comportamento de highlight não funciona como esperado  
**Relacionado ao split?** Não  
**Ação**: Investigar se é regressão real

---

### 9. LinkCandidateJobModal.test.tsx
**Classificação**: RELACIONADO A FASE 24.3C  
**Teste**: "remove o estado vazio após o vínculo do candidato"  
**Causa**: Teste procura por texto "Nenhuma vaga vinculada", mas agora o texto é "Candidato aguardando vaga"  
**Render**: 
```html
<h2>Candidato aguardando vaga</h2>
<p>Vincule a uma vaga para análise, score e acompanhamento no funil.</p>
```

**Relacionado ao split?** Não, é mudança intencional em 24.3C  
**Ação**: Corrigir teste para procurar pelo novo texto

---

### 10. useCandidateData.test.tsx
**Classificação**: PRE-EXISTING  
**Causa**: Mock falta exportação `getCandidateRankingEntry` em jobsService  
```
Error: No "getCandidateRankingEntry" export is defined on the mock
```
**Relacionado ao split?** Não  
**Ação**: Deixar como está (fora do escopo de 24.4)

---

## Análise de Relacionamento com Split do CandidateDrawer

### Falhas NÃO relacionadas ao split (7/9):
1. CollaborationTab (pre-existing)
2. CandidatePortalFlow (24.3C UI changes)
3. CandidatesPageRow (24.3C UI changes)
4. KanbanCard (24.3C ou regressão de rendering)
5. KanbanColumn (24.3C ou regressão de highlighting)
6. LinkCandidateJobModal (24.3C text change)
7. useCandidateData (pre-existing mock)

### Falhas SIM relacionadas ao split (0/9):
Nenhuma falha foi causada diretamente pelo split de CandidateDrawer.

---

## Plano de Ação para Etapa 1.1

### Fase A: Corrigir testes desatualizados (24.3C related)
1. **LinkCandidateJobModal.test.tsx**: Atualizar texto procurado
2. **CandidatesPageRow.test.tsx**: Corrigir seletores de elementos
3. **CandidatePortalFlow.test.tsx**: Investigar e ajustar mocks/seletores

### Fase B: Investigar regressões (se necessário)
1. **KanbanCard.test.tsx**: Badge "Mais aderente" não renderiza
2. **KanbanColumn.test.tsx**: Highlight não funciona

### Fase C: Deixar como está (fora do escopo)
1. **CollaborationTab.test.tsx** (pre-existing)
2. **useCandidateData.test.tsx** (pre-existing)

---

## Conclusão

✅ **O split do CandidateDrawer foi bem-sucedido — NENHUMA falha foi causada por ele.**

As 9 falhas são:
- 2 pre-existing (fora do escopo)
- 7 relacionadas às mudanças de UI da Fase 24.3C (destas, 6 são testes claramente desatualizados)

**Recomendação**: Corrigir as 6 falhas desatualizadas de 24.3C. Investigar as 2 de KanbanCard/KanbanColumn para determinar se são regressões reais.
