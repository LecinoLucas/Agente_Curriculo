## HIGH

### Pipeline visual após avanço de candidato

Os testes protegem call-count e reload de segurança, mas este fechamento não inclui validação manual de UX para garantir que a atualização visual do board permaneça consistente em todos os cenários reais de arraste e avanço.

### Contrato `hired -> pre_admission` em ambiente real

O contrato foi coberto em teste e commit separado, mas ainda vale confirmar o comportamento em ambiente integrado real com checklist padrão ativo e ausente, já que a etapa impacta fluxo operacional de RH.

## MEDIUM

### Kanban ainda sem virtualização

O custo de rede caiu, mas listas extensas ainda podem pressionar renderização e memória no frontend.

### Fallback JSON do RAG continua menos preciso que `pgvector`

Agora está protegido por teto e warning, mas ainda é um modo degradado.

### Aba `Performance` do Health ainda mostra budgets, não métricas runtime agregadas

Isso é honesto e intencional, mas limita ação operacional em tempo real.

### Pré-admissão ainda depende de fallback se a mutação não retornar payload suficiente

O comportamento está seguro, porém o ganho máximo depende do contrato backend continuar suficiente para atualização local.

### Candidate overview / drawer ainda pode concentrar reload agregado

Esse ponto foi citado na auditoria e ainda não teve fase dedicada.

## LOW

### Warnings antigos de `act(...)` e future flags do React Router

Persistem nos testes frontend, sem falha funcional neste ciclo.

### Warnings Pydantic V2

Persistem no backend, sem relação direta com performance.

### Documentação distribuída em `.design`

O material está completo, mas continua espalhado por fase em vez de centralizado em um índice único.
