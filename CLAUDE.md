# CLAUDE.md

## Regra central obrigatória

Um candidato pode ter no máximo **1 vaga ativa por vez**.

A vaga ativa é definida exclusivamente pelo **pipeline ativo**.

```text
1 candidato = 1 pipeline ativo = 1 vaga ativa
```

Essa regra não é sugestão. É uma restrição de negócio obrigatória.

Se qualquer código, endpoint, teste, migration ou comportamento antigo contradizer esta regra, ele deve ser removido ou corrigido.

---

## Instrução para o Claude

Ao modificar o projeto, não tente “melhorar” o domínio inventando modelos paralelos.

Não crie uma solução mais genérica que permita múltiplas vagas ativas.

Não preserve compatibilidade com comportamento antigo se ele contradizer a regra central.

Não mantenha fallback legado.

Não comente código morto. Exclua.

Não use histórico como estado atual.

Não use análise global como análise atual.

Não use score antigo como score atual.

---

## Fonte de verdade

### Estado atual

```text
Pipeline ativo = vaga atual
```

### Histórico

```text
candidate_job_pipeline_events = histórico
```

A tabela `candidate_job_pipeline_events` registra eventos, mas não define a vaga atual.

O estado atual nunca deve ser calculado a partir do histórico.

---

## Candidato

Um candidato pode existir sem vaga.

Quando não existe pipeline ativo, o candidato deve estar como:

```text
Aguardando vaga
```

Candidato sem pipeline ativo não possui:

- vaga ativa
- score atual
- análise atual vinculada a vaga
- etapa atual de processo seletivo

---

## Pipeline

O pipeline é o vínculo oficial entre candidato e vaga.

Um pipeline ativo deve ter:

- candidato
- vaga

Um candidato pode ter no máximo **1 pipeline ativo**.

Pipeline antigo é histórico.

Pipeline antigo não representa vaga atual.

---

## Vaga ativa

A vaga ativa de um candidato é sempre a vaga do pipeline ativo.

Nunca inferir vaga ativa usando:

- último evento
- última análise
- último score
- `latest_analysis`
- importação
- currículo
- relacionamento legado candidato-vaga
- histórico
- campo global no candidato

A única fonte válida é o pipeline ativo.

---

## Análise por IA

A análise por IA só pode existir quando houver:

- candidato
- currículo
- vaga ativa

A análise deve ser criada automaticamente pelo backend apenas nos fluxos oficiais:

- adicionar candidato à vaga
- transferir candidato para outra vaga

O frontend não deve criar análise automática.

O frontend não deve decidir quando uma análise IA deve ser criada.

O frontend pode apenas chamar endpoints oficiais do backend.

---

## Score

O score atual sempre pertence à vaga ativa.

Regras:

- Score atual = score da vaga do pipeline ativo.
- Sem pipeline ativo = sem score atual.
- Sem vaga ativa = sem score atual.
- Não usar `latest_analysis` global para score atual.
- Não usar score de vaga antiga como score atual.
- Score histórico pode existir, mas não pode afetar o estado atual.

---

## Fluxos oficiais

### Criar candidato

Criar apenas o cadastro do candidato.

Resultado esperado:

```text
Candidato criado
Status: Aguardando vaga
Sem pipeline ativo
Sem vaga ativa
Sem score atual
Sem análise IA automática
```

Não criar pipeline.

Não criar vaga ativa.

Não criar análise IA.

---

### Importar candidato

Importação não é candidatura.

Importação não cria vínculo com vaga.

Importação pode:

- criar candidato
- atualizar dados cadastrais
- anexar currículo
- salvar metadados

Importação não pode:

- criar pipeline automaticamente
- definir vaga ativa automaticamente
- criar score atual
- criar análise IA sem vaga ativa
- vincular candidato a vaga fora do pipeline

Se o candidato importado precisar entrar em uma vaga, usar o fluxo oficial:

```text
Adicionar candidato à vaga
```

---

### Adicionar candidato à vaga

Esse é o fluxo oficial para criar vínculo ativo.

O backend deve:

1. Verificar se o candidato já possui pipeline ativo.
2. Se não possuir, criar pipeline ativo para a vaga.
3. Garantir que não exista outro pipeline ativo para o mesmo candidato.
4. Registrar evento histórico.
5. Criar análise IA automaticamente, se houver currículo.
6. Calcular score para a vaga ativa.

Resultado esperado:

```text
Pipeline ativo criado
Vaga ativa definida
Evento histórico criado
Análise IA criada pelo backend, se houver currículo
Score calculado para a vaga ativa
```

---

### Transferir candidato

Transferir significa trocar a vaga ativa.

Transferência não adiciona uma segunda vaga ativa.

O backend deve:

1. Encontrar o pipeline ativo atual.
2. Desativar ou encerrar o pipeline ativo anterior.
3. Criar ou ativar o novo pipeline para a nova vaga.
4. Garantir que exista apenas 1 pipeline ativo depois da operação.
5. Registrar evento histórico de transferência.
6. Criar nova análise IA, se houver currículo.
7. Recalcular score para a nova vaga ativa.

Resultado esperado:

```text
Pipeline anterior deixa de ser ativo
Novo pipeline passa a ser ativo
Vaga ativa é substituída
Evento histórico criado
Nova análise IA criada pelo backend, se houver currículo
Score recalculado para a nova vaga ativa
```

---

### Remover candidato da vaga ativa

Ao remover candidato da vaga ativa:

1. Desativar ou encerrar o pipeline ativo.
2. Registrar evento histórico.
3. Retornar candidato para `Aguardando vaga`.
4. Remover score atual.
5. Não apagar histórico.

Resultado esperado:

```text
Sem pipeline ativo
Sem vaga ativa
Sem score atual
Status: Aguardando vaga
Histórico preservado
```

---

### Retornar candidato para vaga antiga

Histórico antigo não bloqueia retorno.

Retorno para vaga antiga deve ser tratado como novo vínculo ativo via pipeline.

Não usar evento antigo como estado atual.

Não reativar estado antigo sem passar pela regra do pipeline ativo.

---

## Proibições absolutas

É proibido:

- permitir múltiplas vagas ativas para o mesmo candidato
- permitir múltiplos pipelines ativos para o mesmo candidato
- criar vínculo candidato-vaga fora do pipeline
- criar endpoint paralelo para vínculo candidato-vaga
- usar histórico para decidir vaga atual
- usar último evento como vaga atual
- usar última análise como vaga atual
- usar `latest_analysis` global para score atual
- usar score antigo como score atual
- criar score atual sem vaga ativa
- criar análise IA sem candidato, currículo e vaga ativa
- deixar frontend criar análise automática
- misturar importação com entrada em vaga
- preservar fallback legado contraditório
- manter teste esperando múltiplas vagas ativas
- comentar código morto em vez de excluir

---

## Política de legado

Toda lógica antiga que contradiz este documento deve ser removida.

Não manter compatibilidade com regra antiga se ela permitir:

- múltiplas vagas ativas
- vínculo fora do pipeline
- score sem vaga ativa
- análise IA sem vaga ativa
- histórico como estado atual
- `latest_analysis` global como análise atual

Se uma parte antiga precisar permanecer por auditoria, ela deve ser explicitamente marcada como histórica.

Lógica histórica não pode alterar nem definir:

- vaga atual
- pipeline ativo
- score atual
- análise atual
- status atual
- etapa atual do processo seletivo

---

## Backend

O backend é responsável por garantir as regras de negócio.

O backend deve impedir:

- mais de um pipeline ativo por candidato
- vínculo candidato-vaga fora do pipeline
- análise IA sem vaga ativa
- score atual sem vaga ativa
- transferência que mantenha duas vagas ativas
- importação criando pipeline automaticamente

Sempre que possível, proteger a regra também no banco de dados com constraint, índice único parcial ou transação.

Não depender apenas do frontend.

---

## Frontend

O frontend não cria regra de negócio paralela.

O frontend deve respeitar o estado retornado pelo backend.

O frontend pode:

- listar candidatos
- exibir status
- exibir vaga ativa
- exibir pipeline ativo
- exibir análise da vaga ativa
- exibir score da vaga ativa
- chamar endpoint oficial para adicionar à vaga
- chamar endpoint oficial para transferir
- chamar endpoint oficial para remover da vaga

O frontend não pode:

- criar análise IA automática
- criar vínculo direto candidato-vaga
- decidir vaga ativa pelo histórico
- decidir score atual por `latest_analysis`
- exibir vaga antiga como ativa
- exibir múltiplas vagas ativas para o mesmo candidato
- misturar importação com entrada em vaga

---

## Testes obrigatórios

Os testes devem validar:

- candidato criado sem vaga fica em `Aguardando vaga`
- candidato importado sem vaga fica em `Aguardando vaga`
- importação não cria pipeline automaticamente
- adicionar candidato à vaga cria pipeline ativo
- adicionar candidato à vaga cria análise IA no backend, se houver currículo
- adicionar candidato à vaga calcula score da vaga ativa
- candidato não pode ter múltiplos pipelines ativos
- transferência desativa pipeline anterior
- transferência ativa ou cria novo pipeline
- transferência cria nova análise IA, se houver currículo
- transferência recalcula score para nova vaga ativa
- remover candidato da vaga desativa pipeline ativo
- remover candidato da vaga retorna para `Aguardando vaga`
- histórico antigo não bloqueia retorno
- histórico não define vaga atual
- `latest_analysis` global não define score atual
- frontend não cria análise automática

Remover testes que esperam comportamento legado.

---

## Checklist antes de alterar código

Antes de implementar ou refatorar, responder:

1. Isso permite mais de uma vaga ativa para o mesmo candidato?
2. Isso permite mais de um pipeline ativo para o mesmo candidato?
3. Isso cria vínculo fora do pipeline?
4. Isso usa histórico como estado atual?
5. Isso usa último evento como vaga atual?
6. Isso usa `latest_analysis` global como score atual?
7. Isso cria score sem vaga ativa?
8. Isso cria análise IA sem candidato, currículo e vaga ativa?
9. Isso mistura importação com entrada em vaga?
10. Isso mantém fallback legado?
11. Isso deixa o frontend criar análise automática?
12. Isso comenta código morto em vez de excluir?

Se a resposta for “sim” para qualquer item, a alteração está errada.

---

## Resumo operacional

```text
Criar candidato
→ Aguardando vaga
→ sem pipeline
→ sem vaga ativa
→ sem score atual
→ sem análise IA automática

Importar candidato
→ cria/atualiza cadastro
→ pode anexar currículo
→ não cria pipeline
→ não define vaga ativa
→ não cria análise IA sem vaga
→ não cria score sem vaga

Adicionar à vaga
→ cria pipeline ativo
→ cria evento histórico
→ cria análise IA no backend, se houver currículo
→ calcula score da vaga ativa

Transferir
→ desativa pipeline anterior
→ cria/ativa novo pipeline
→ cria evento histórico
→ cria nova análise IA no backend, se houver currículo
→ recalcula score da nova vaga ativa

Remover da vaga
→ desativa pipeline ativo
→ cria evento histórico
→ volta para Aguardando vaga
→ sem vaga ativa
→ sem score atual
```

---

## Regra final

Se houver conflito entre código legado e este documento, este documento vence.

Se houver conflito entre histórico e pipeline ativo, o pipeline ativo vence.

Se houver conflito entre `latest_analysis` global e análise da vaga ativa, a análise da vaga ativa vence.

Se houver conflito entre frontend e backend, o backend vence.

Se houver dúvida, aplicar sempre:

```text
1 candidato = 1 pipeline ativo = 1 vaga ativa
```