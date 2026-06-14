# GEMINI.md

## Instrução principal

Você está trabalhando em um sistema de admissão/RH.

A regra central do domínio é obrigatória e não pode ser reinterpretada:

```text
1 candidato = no máximo 1 pipeline ativo = 1 vaga ativa
```

A vaga ativa de um candidato é definida exclusivamente pelo pipeline ativo.

Não invente regras alternativas.
Não use comportamento legado como referência.
Não mantenha fallback antigo se ele contradizer este documento.

---

## Regra central

Um candidato pode existir sem vaga.

Quando o candidato não possui pipeline ativo, seu status deve ser:

```text
Aguardando vaga
```

Um candidato com pipeline ativo possui exatamente uma vaga ativa.

A vaga ativa é sempre a vaga vinculada ao pipeline ativo.

Nunca definir vaga ativa usando:

- última análise
- último score
- último evento histórico
- importação
- currículo
- relacionamento legado candidato-vaga
- `latest_analysis`
- qualquer campo global do candidato

---

## Pipeline

O pipeline representa o vínculo ativo entre candidato e vaga.

Regras obrigatórias:

- pipeline só existe com candidato e vaga
- candidato pode ter no máximo 1 pipeline ativo
- pipeline ativo define a vaga atual
- pipeline antigo é histórico
- transferência troca o pipeline ativo
- transferência não adiciona segunda vaga ativa

Se uma implementação permitir dois pipelines ativos para o mesmo candidato, ela está errada.

---

## Histórico

A tabela `candidate_job_pipeline_events` é somente histórico.

Ela pode registrar:

- entrada em vaga
- transferência
- remoção
- encerramento
- reentrada
- eventos antigos

Ela não pode definir estado atual.

O estado atual nunca deve ser calculado a partir do histórico.

Histórico antigo não bloqueia retorno do candidato para uma vaga.

---

## Análise IA

A análise por IA só pode existir quando houver:

- candidato
- currículo
- vaga ativa

A análise deve ser criada automaticamente pelo backend apenas nos fluxos oficiais:

- adicionar candidato à vaga
- transferir candidato para outra vaga

O frontend não deve criar análise automática.

Não criar análise IA sem vaga ativa.

Não usar análise global para representar a análise atual da vaga.

---

## Score

O score sempre pertence à vaga ativa.

Regras obrigatórias:

- score atual vem da vaga do pipeline ativo
- sem pipeline ativo = sem vaga ativa
- sem vaga ativa = sem score atual
- não usar `latest_analysis` global para score atual
- não misturar score de vaga antiga com vaga atual
- score histórico não pode afetar estado atual

---

## Importação

Importação de candidato não é entrada em vaga.

Ao importar candidato, o sistema pode:

- criar candidato
- atualizar dados cadastrais
- anexar currículo
- salvar metadados de importação

Ao importar candidato, o sistema não pode:

- criar pipeline automaticamente
- definir vaga ativa automaticamente
- criar análise IA automaticamente sem vaga
- criar score sem vaga
- criar vínculo candidato-vaga fora do pipeline

Se o candidato importado precisar entrar em uma vaga, use o fluxo oficial de adicionar candidato à vaga.

---

## Fluxos oficiais

### Criar candidato

Resultado esperado:

```text
Candidato criado
Status: Aguardando vaga
Sem pipeline ativo
Sem vaga ativa
Sem score atual
Sem análise IA automática
```

---

### Adicionar candidato à vaga

O backend deve:

1. verificar se o candidato já possui pipeline ativo
2. impedir múltiplos pipelines ativos
3. criar pipeline ativo para a vaga, se não houver pipeline ativo
4. registrar evento histórico
5. criar análise IA automaticamente, se houver currículo
6. calcular score da vaga ativa

Não criar vínculo fora do pipeline.

---

### Transferir candidato

Transferir significa trocar a vaga ativa.

O backend deve:

1. identificar o pipeline ativo atual
2. desativar ou encerrar o pipeline anterior
3. criar ou ativar novo pipeline para a nova vaga
4. garantir que exista apenas 1 pipeline ativo
5. registrar evento histórico de transferência
6. criar nova análise IA, se houver currículo
7. recalcular score da nova vaga ativa

Transferência não pode criar múltiplas vagas ativas.

---

### Remover candidato da vaga ativa

O backend deve:

1. desativar ou encerrar o pipeline ativo
2. registrar evento histórico
3. retornar o candidato para `Aguardando vaga`
4. remover vaga ativa atual
5. remover score atual

Histórico deve ser preservado.

---

## Proibido

É proibido:

- múltiplas vagas ativas para o mesmo candidato
- múltiplos pipelines ativos para o mesmo candidato
- vínculo candidato-vaga fora do pipeline
- frontend criar análise automática
- análise IA sem vaga ativa
- score atual sem vaga ativa
- usar histórico para decidir vaga atual
- usar `latest_analysis` global para score atual
- usar última análise para decidir vaga atual
- usar último score para decidir vaga atual
- misturar importação com pipeline
- criar endpoint paralelo de vínculo fora do pipeline
- manter fallback legado contraditório
- manter código morto comentado
- manter teste esperando comportamento antigo

---

## Política de legado

Qualquer lógica antiga que contradiz este documento deve ser removida.

Não manter fallback para comportamento antigo.

Não manter endpoint paralelo criando vínculo fora do pipeline.

Não manter teste que espera múltiplas vagas ativas.

Não comentar código morto. Excluir.

Se alguma lógica antiga precisar permanecer apenas para auditoria, ela deve ser marcada como histórica e não pode afetar:

- vaga atual
- pipeline ativo
- score atual
- análise atual
- status atual do candidato

---

## Backend

O backend deve proteger as regras do domínio.

O backend deve impedir:

- múltiplos pipelines ativos para o mesmo candidato
- vínculo fora do pipeline
- análise IA sem vaga ativa
- score sem vaga ativa
- transferência que preserve duas vagas ativas
- importação criando pipeline automaticamente

Sempre que possível, usar validação transacional, constraint ou índice único parcial para garantir:

```text
1 candidato = no máximo 1 pipeline ativo
```

---

## Frontend

O frontend não pode criar regra paralela.

O frontend deve apenas refletir o estado vindo do backend.

O frontend pode:

- exibir candidato
- exibir status
- exibir vaga ativa
- exibir pipeline ativo
- exibir análise da vaga ativa
- exibir score da vaga ativa
- chamar endpoint oficial para adicionar à vaga
- chamar endpoint oficial para transferir
- chamar endpoint oficial para remover da vaga

O frontend não pode:

- criar análise automática
- criar vínculo candidato-vaga diretamente
- decidir vaga ativa por histórico
- decidir score atual por análise global
- exibir múltiplas vagas ativas
- misturar importação com entrada em vaga

---

## Testes obrigatórios

Os testes devem validar:

- candidato criado sem vaga fica em `Aguardando vaga`
- candidato importado sem vaga fica em `Aguardando vaga`
- importação não cria pipeline automaticamente
- adicionar à vaga cria pipeline ativo
- adicionar à vaga cria análise IA no backend, se houver currículo
- adicionar à vaga calcula score da vaga ativa
- candidato não pode ter múltiplos pipelines ativos
- transferência desativa pipeline anterior
- transferência ativa ou cria novo pipeline
- transferência cria nova análise IA, se houver currículo
- transferência recalcula score para a nova vaga
- remoção da vaga desativa pipeline ativo
- remoção retorna candidato para `Aguardando vaga`
- histórico antigo não bloqueia retorno
- histórico não define vaga atual
- `latest_analysis` global não define score atual
- frontend não cria análise automática

Remover testes que esperam comportamento legado.

---

## Checklist antes de alterar código

Antes de implementar qualquer alteração, responda:

1. Isso permite mais de uma vaga ativa para o mesmo candidato?
2. Isso cria vínculo fora do pipeline?
3. Isso usa histórico como estado atual?
4. Isso usa `latest_analysis` global para score atual?
5. Isso cria score sem vaga ativa?
6. Isso cria análise IA sem candidato, currículo e vaga ativa?
7. Isso mistura importação com entrada em vaga?
8. Isso mantém fallback legado?
9. Isso deixa o frontend criar análise automática?
10. Isso mantém código morto comentado?

Se a resposta for sim para qualquer item, a implementação está errada.

---

## Resumo final

```text
Criar candidato
→ Aguardando vaga
→ sem pipeline
→ sem vaga ativa
→ sem score
→ sem análise IA automática

Importar candidato
→ cria/atualiza cadastro
→ pode anexar currículo
→ não cria pipeline
→ não cria vaga ativa
→ não cria análise IA sem vaga
→ não cria score sem vaga

Adicionar à vaga
→ cria pipeline ativo
→ cria evento histórico
→ cria análise IA no backend, se houver currículo
→ calcula score da vaga ativa

Transferir
→ desativa pipeline anterior
→ cria/ativa novo pipeline ativo
→ cria evento histórico
→ cria nova análise IA no backend, se houver currículo
→ recalcula score da nova vaga

Remover da vaga
→ desativa pipeline ativo
→ cria evento histórico
→ volta para Aguardando vaga
→ sem vaga ativa
→ sem score atual
```

Se houver conflito entre código antigo e este documento, este documento vence.

Se houver conflito entre histórico e pipeline ativo, o pipeline ativo vence.

Se houver conflito entre análise global e análise da vaga ativa, a análise da vaga ativa vence.

Se houver conflito entre frontend e backend, o backend vence.

Regra final:

```text
1 candidato = no máximo 1 pipeline ativo = 1 vaga ativa
```