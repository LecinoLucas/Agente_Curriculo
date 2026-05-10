---
name: admissao-rh-domain
description: Regras do domínio de Admissão/RH — candidato, vaga, pipeline, análise IA, score, importação e histórico.
---

## Objetivo

Garantir que toda implementação respeite a regra central do domínio definida no AGENTS.md.

> Para detalhes completos, consulte sempre o `AGENTS.md`. Esta skill é um gatilho operacional resumido.

## Regra central

```
1 candidato = no máximo 1 pipeline ativo = 1 vaga ativa
```

## Quando usar

- Ao implementar qualquer funcionalidade que envolva candidato, vaga, pipeline, score ou análise IA.
- Ao avaliar se uma importação, criação ou transferência está correta.

## Conceitos obrigatórios

| Conceito | Fonte de verdade |
|---|---|
| Vaga atual | Pipeline ativo |
| Score atual | Vaga do pipeline ativo |
| Análise atual | Vaga do pipeline ativo |
| Histórico | `candidate_job_pipeline_events` (somente auditoria) |

## Regras principais

- Candidato sem pipeline ativo → status `Aguardando vaga`.
- Histórico nunca define vaga atual.
- Importação não cria pipeline nem vaga ativa automaticamente.
- Análise IA só pode existir com: candidato + currículo + vaga ativa.
- Backend cria análise IA automaticamente apenas em: **adicionar à vaga** e **transferir**.
- Score atual sempre pertence à vaga do pipeline ativo.
- Sem vaga ativa = sem score atual.
- Transferência substitui a vaga ativa — não adiciona outra.
- Máximo de 1 pipeline ativo por candidato, sempre.

## Nunca fazer

- Não usar histórico para decidir vaga atual ou score atual.
- Não usar `latest_analysis` global como análise atual.
- Não criar pipeline fora dos fluxos oficiais.
- Não criar vínculo candidato-vaga fora do pipeline.
- Não permitir múltiplos pipelines ativos.
- Não criar análise IA sem candidato + currículo + vaga ativa.
- Não deixar o frontend criar análise IA automática.
- Não manter fallback legado.
- Não comentar código morto: excluir.

## Checklist antes de concluir

- [ ] Existe no máximo 1 pipeline ativo para o candidato?
- [ ] A vaga ativa vem do pipeline ativo, não do histórico?
- [ ] Importação não criou pipeline nem vaga ativa automaticamente?
- [ ] Análise IA só foi criada com candidato + currículo + vaga ativa?
- [ ] Score está vinculado à vaga do pipeline ativo?
- [ ] Transferência desativou o pipeline anterior?
- [ ] Histórico foi preservado sem afetar o estado atual?
