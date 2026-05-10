# AGENTS.md

## Papel deste arquivo

Este é o arquivo central de instruções do projeto.

Ele define a regra oficial de domínio para candidatos, vagas, pipelines, análises e scores.

Outros arquivos, como `GEMINI.md`, `CLAUDE.md` e `CODEX.md`, podem adicionar instruções específicas para cada ferramenta ou modelo, mas não podem contradizer este arquivo.

Se houver conflito entre qualquer arquivo específico e este documento, este documento vence.

---

## Regra central do domínio

```text
1 candidato = no máximo 1 pipeline ativo = 1 vaga ativa
```

A vaga ativa de um candidato é definida exclusivamente pelo pipeline ativo.

Nenhuma outra fonte pode definir a vaga atual.

---

## Fonte de verdade

### Estado atual

```text
pipeline ativo = vaga atual
```

### Histórico

```text
candidate_job_pipeline_events = histórico
```

A tabela `candidate_job_pipeline_events` serve apenas para auditoria, timeline e exibição histórica.

Ela não pode decidir:

- vaga atual
- pipeline ativo
- score atual
- análise atual
- status atual
- etapa atual do processo seletivo

Histórico antigo não bloqueia retorno do candidato para uma vaga.

---

## Conceitos oficiais

### Candidato

Um candidato pode existir sem estar vinculado a nenhuma vaga.

Quando o candidato não possui pipeline ativo, seu status deve ser:

```text
Aguardando vaga
```

Candidato sem pipeline ativo não possui:

- vaga ativa
- score atual
- análise atual de vaga
- etapa atual de processo seletivo

---

### Pipeline

O pipeline representa o vínculo entre candidato e vaga.

Um pipeline ativo representa a vaga atual do candidato.

Um pipeline só pode existir quando houver:

- candidato
- vaga

Um candidato pode ter no máximo 1 pipeline ativo.

Pipelines antigos são históricos e não representam vaga atual.

---

### Vaga ativa

A vaga ativa é sempre a vaga do pipeline ativo.

Nunca inferir vaga ativa por:

- última análise
- `latest_analysis`
- último score
- último evento histórico
- último vínculo antigo
- importação
- currículo
- relacionamento legado candidato-vaga
- campo global no candidato

A única fonte válida para a vaga atual é o pipeline ativo.

---

## Regras obrigatórias

- Candidato pode existir sem vaga.
- Candidato sem pipeline ativo deve ficar como `Aguardando vaga`.
- Pipeline só existe vinculado a candidato e vaga.
- Apenas 1 pipeline ativo por candidato é permitido.
- Transferência troca a vaga ativa.
- Transferência não adiciona segunda vaga ativa.
- Histórico antigo não bloqueia retorno para uma vaga.
- Eventos históricos nunca substituem o pipeline ativo como fonte de verdade.
- Importação não cria pipeline automaticamente.
- Importação não define vaga ativa automaticamente.
- Importação não cria análise IA sem vaga ativa.
- Importação não cria score sem vaga ativa.
- Score atual sempre pertence à vaga do pipeline ativo.
- Análise atual sempre pertence à vaga do pipeline ativo.

---

## Análise IA

A análise IA só pode existir quando houver:

- candidato
- currículo
- vaga ativa

A análise IA deve ser criada automaticamente pelo backend apenas nos fluxos oficiais:

- adicionar candidato à vaga
- transferir candidato para outra vaga

O frontend não deve criar análise IA automática.

O frontend pode apenas:

- exibir análise existente
- chamar endpoints oficiais do backend
- solicitar ações explícitas permitidas pelo backend

Não criar análise IA por importação simples.

Não criar análise IA usando vaga inferida por histórico, score antigo, `latest_analysis` ou vínculo legado.

---

## Score

O score do candidato deve ser sempre calculado em relação à vaga ativa.

Regras:

- Score atual = score da vaga do pipeline ativo.
- Sem pipeline ativo = sem vaga ativa.
- Sem vaga ativa = sem score atual.
- Não usar análise global para score atual.
- Não usar `latest_analysis` global para score atual.
- Não misturar score histórico com score atual.
- Score antigo pode existir apenas como histórico.
- Score histórico não pode afetar vaga atual.

---

## Fluxos oficiais

### Criar candidato

Ao criar candidato, o sistema deve criar apenas o cadastro.

Resultado esperado:

```text
Candidato criado
Status: Aguardando vaga
Sem pipeline ativo
Sem vaga ativa
Sem score atual
Sem análise IA automática
```

Não criar:

- pipeline
- vínculo com vaga
- análise IA
- score

---

### Importar candidato

Importação não é entrada em vaga.

Ao importar candidato, o sistema pode:

- criar candidato
- atualizar dados cadastrais
- anexar currículo
- salvar metadados de importação

Ao importar candidato, o sistema não pode:

- criar pipeline automaticamente
- definir vaga ativa automaticamente
- criar análise IA sem vaga ativa
- criar score sem vaga ativa
- criar vínculo candidato-vaga fora do pipeline

Resultado esperado:

```text
Candidato importado ou atualizado
Currículo anexado, se existir
Status: Aguardando vaga, se não houver pipeline ativo
Sem pipeline ativo automático
Sem vaga ativa automática
Sem análise IA automática sem vaga
Sem score atual sem vaga
```

Se o candidato importado precisar entrar em uma vaga, usar o fluxo oficial:

```text
Adicionar candidato à vaga
```

---

### Adicionar candidato à vaga

Adicionar candidato à vaga é o fluxo oficial para criar vínculo ativo.

O backend deve:

1. Verificar se o candidato já possui pipeline ativo.
2. Impedir criação de segunda vaga ativa.
3. Criar pipeline ativo se não houver pipeline ativo.
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

Esse fluxo não pode criar múltiplas vagas ativas.

---

### Transferir candidato

Transferir significa substituir a vaga ativa.

Transferência não é adicionar uma segunda vaga.

O backend deve:

1. Identificar o pipeline ativo atual.
2. Desativar ou encerrar o pipeline ativo anterior.
3. Criar ou ativar pipeline da nova vaga.
4. Garantir que exista apenas 1 pipeline ativo após a operação.
5. Registrar evento histórico de transferência.
6. Criar nova análise IA para a nova vaga, se houver currículo.
7. Recalcular score para a nova vaga ativa.

Resultado esperado:

```text
Pipeline anterior inativo
Novo pipeline ativo
Vaga ativa substituída
Evento histórico de transferência criado
Nova análise IA criada pelo backend, se houver currículo
Score recalculado para a nova vaga ativa
```

---

### Remover candidato da vaga ativa

Quando o candidato for removido da vaga ativa, o backend deve:

1. Desativar ou encerrar o pipeline ativo.
2. Registrar evento histórico.
3. Colocar o candidato em `Aguardando vaga`.

Resultado esperado:

```text
Sem pipeline ativo
Sem vaga ativa
Sem score atual
Status: Aguardando vaga
Histórico preservado
```

Remover candidato da vaga ativa não deve apagar histórico.

---

### Retornar candidato para vaga antiga

Um candidato pode retornar para uma vaga antiga.

Histórico antigo não bloqueia retorno.

O retorno deve ser tratado como novo vínculo ativo via pipeline.

Resultado esperado:

```text
Novo pipeline ativo criado ou reativado
Evento histórico criado
Vaga antiga passa a ser vaga ativa novamente
Nova análise IA criada, se houver currículo
Score recalculado para a vaga ativa
```

Não usar evento antigo como estado atual.

---

## Proibições

É proibido:

- permitir múltiplas vagas ativas para o mesmo candidato
- permitir múltiplos pipelines ativos para o mesmo candidato
- criar vínculo candidato-vaga fora do pipeline
- criar endpoint paralelo de vínculo fora do pipeline
- criar análise IA sem candidato, currículo e vaga ativa
- criar score atual sem vaga ativa
- fazer o frontend criar análise IA automática
- usar histórico para decidir vaga atual
- usar último evento histórico para decidir vaga atual
- usar `latest_analysis` global como análise da vaga ativa
- usar `latest_analysis` global para score atual
- usar score antigo como score atual
- misturar importação com entrada em vaga
- manter fallback para comportamento antigo
- manter teste esperando múltiplas vagas ativas
- manter código morto comentado
- preservar regra legada por compatibilidade

Se código antigo contradiz este documento, remova o código antigo.

Não comentar código morto. Excluir.

---

## Política de legado

Toda lógica antiga que contradiz a regra oficial deve ser removida.

Não manter:

- fallback para comportamento antigo
- endpoint paralelo criando vínculo fora do pipeline
- teste esperando múltiplas vagas ativas
- código morto comentado
- lógica baseada em histórico para definir estado atual
- uso de `latest_analysis` global para score atual
- relacionamento candidato-vaga fora do pipeline ativo
- regra que permita candidato em múltiplas vagas ativas

Se alguma lógica antiga precisar permanecer apenas para auditoria, ela deve ser marcada explicitamente como histórica.

Lógica histórica não pode afetar:

- vaga atual
- pipeline ativo
- score atual
- análise atual
- status atual
- etapa atual do processo seletivo

---

## Backend

O backend é a autoridade da regra de negócio.

O backend deve impedir:

- múltiplos pipelines ativos para o mesmo candidato
- vínculo candidato-vaga fora do pipeline
- análise IA sem vaga ativa
- score atual sem vaga ativa
- importação criando vaga ativa automaticamente
- transferência mantendo pipeline anterior ativo
- fallback para regra antiga

O backend deve criar análise IA automaticamente apenas em:

- adicionar candidato à vaga
- transferir candidato para outra vaga

---

## Frontend

O frontend deve consumir o estado oficial do backend.

O frontend pode:

- listar candidatos
- exibir status
- exibir pipeline ativo
- exibir vaga ativa
- exibir score da vaga ativa
- exibir análise da vaga ativa
- chamar endpoint oficial de adicionar à vaga
- chamar endpoint oficial de transferência
- chamar endpoint oficial de remoção

O frontend não pode:

- criar análise IA automática
- criar vínculo direto candidato-vaga
- decidir vaga ativa usando histórico
- decidir score atual usando análise global
- usar `latest_analysis` global como score atual
- misturar importação com entrada em vaga
- exibir vaga antiga como ativa
- exibir múltiplas vagas ativas para o mesmo candidato

---

## Banco de dados

A modelagem deve reforçar a regra:

```text
1 candidato = no máximo 1 pipeline ativo
```

Sempre que possível, usar:

- constraint
- índice único parcial
- validação transacional
- checagem de concorrência

A aplicação não deve depender apenas do frontend para garantir essa regra.

A regra deve ser protegida no backend e, se possível, no banco.

---

## Testes obrigatórios

Ao alterar esta área, validar:

- candidato criado sem vaga fica `Aguardando vaga`
- candidato importado sem vaga fica `Aguardando vaga`
- importação não cria pipeline automaticamente
- importação não cria análise IA sem vaga
- importação não cria score sem vaga
- adicionar candidato à vaga cria pipeline ativo
- adicionar candidato à vaga cria análise IA no backend, se houver currículo
- adicionar candidato à vaga calcula score da vaga ativa
- candidato não pode ter múltiplos pipelines ativos
- transferência desativa pipeline anterior
- transferência cria ou ativa novo pipeline
- transferência mantém apenas 1 pipeline ativo
- transferência cria nova análise IA, se houver currículo
- transferência recalcula score da nova vaga
- remover candidato da vaga desativa pipeline ativo
- remover candidato da vaga retorna candidato para `Aguardando vaga`
- histórico antigo não bloqueia retorno
- histórico não define vaga atual
- `latest_analysis` global não define score atual
- frontend não cria análise IA automática

Remover ou atualizar testes que esperam:

- múltiplas vagas ativas
- vínculo fora do pipeline
- análise global como score atual
- histórico como fonte de estado atual
- fallback para comportamento legado

---

## Invariantes

Estas condições devem ser sempre verdadeiras:

```text
candidato sem pipeline ativo => Aguardando vaga

candidato com pipeline ativo => possui exatamente 1 vaga ativa

pipeline ativo => possui candidato e vaga

score atual => pertence à vaga do pipeline ativo

análise atual => pertence à vaga do pipeline ativo

histórico => não define estado atual

importação => não cria pipeline automaticamente

transferência => substitui vaga ativa, não adiciona outra
```

Se qualquer uma dessas condições for quebrada, a implementação está errada.

---

## Checklist antes de implementar

Antes de implementar qualquer endpoint, migration, teste, ajuste de frontend ou regra de backend, verificar:

1. Isso permite mais de um pipeline ativo para o mesmo candidato?
2. Isso permite mais de uma vaga ativa para o mesmo candidato?
3. Isso cria vínculo candidato-vaga fora do pipeline?
4. Isso usa histórico como estado atual?
5. Isso usa último evento histórico como vaga atual?
6. Isso usa análise global para score atual?
7. Isso usa `latest_analysis` global como score atual?
8. Isso cria análise IA sem candidato, currículo e vaga ativa?
9. Isso cria score sem vaga ativa?
10. Isso mistura importação com entrada em vaga?
11. Isso mantém fallback legado?
12. Isso deixa o frontend criar análise IA automática?
13. Isso mantém código morto comentado?
14. Isso mantém teste esperando regra antiga?

Se a resposta for “sim” para qualquer item, a implementação está errada.

---

## Uso com arquivos específicos

Este projeto pode ter arquivos específicos para modelos ou ferramentas:

```text
GEMINI.md
CLAUDE.md
CODEX.md
```

Esses arquivos devem conter apenas instruções complementares de comportamento para cada ferramenta.

Eles não devem repetir toda a regra de domínio.

Eles não podem mudar a regra central.

Se houver conflito:

```text
AGENTS.md vence
```

---

## Regra final

Se houver conflito entre regra antiga e este documento, este documento vence.

Se houver conflito entre histórico e pipeline ativo, o pipeline ativo vence.

Se houver conflito entre análise global e análise da vaga ativa, a análise da vaga ativa vence.

Se houver conflito entre frontend e backend, o backend vence.

Aplicar sempre:

```text
1 candidato = no máximo 1 pipeline ativo = 1 vaga ativa
```