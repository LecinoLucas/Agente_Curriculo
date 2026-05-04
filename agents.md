# agents.md

Regra central:
1 candidato = 1 vaga ativa (via pipeline)

Regras:
- Candidato pode existir sem vaga
- Status inicial: Aguardando vaga
- Pipeline só existe quando vinculado a uma vaga
- Apenas 1 pipeline ativo por candidato
- Transferência troca a vaga ativa (não adiciona outra)
- Histórico antigo não bloqueia retorno

Análise (IA):
- Só existe com candidato + currículo + vaga
- Criada automaticamente no backend (add/transfer)
- Frontend NÃO cria análise automática

Score:
- Sempre da vaga ativa
- Nunca usar análise global
- Sem vaga = sem score

Fonte de verdade:
- Pipeline ativo = vaga atual
- candidate_job_links = histórico

Proibido:
- Múltiplas vagas ativas
- Criar análise manual após add/transfer
- Vínculo fora do pipeline
- Misturar importação com pipeline

Fluxo:
Criar candidato → Aguardando vaga
Adicionar à vaga → cria pipeline + análise
Transferir → troca pipeline + nova análise

## Política de legado

- Toda lógica antiga que contradiz a regra oficial deve ser removida.
- Não manter fallback para comportamento antigo.
- Não manter endpoint paralelo criando vínculo fora do pipeline.
- Não manter teste que espera múltiplas vagas ativas.
- Não comentar código morto: excluir.
- Não deixar candidate_job_links decidir vaga atual.
- Não usar latest_analysis global para score atual.
- Se a lógica antiga for necessária como histórico, ela deve ser explicitamente marcada como histórico e não pode afetar o estado atual.
