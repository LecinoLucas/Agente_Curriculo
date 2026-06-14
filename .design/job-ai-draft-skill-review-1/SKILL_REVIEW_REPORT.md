Problema

O `JobAiDraftPanel` já exibia `suggested_skills[]`, mas sem uma revisão operacional clara para o RH distinguir rapidamente:

- skills já existentes no catálogo;
- novas sugestões;
- conflitos de catálogo;
- o que é seguro para matching IA;
- o que exige revisão manual.

Solução

Foi criada uma seção compacta de revisão das skills sugeridas, agrupada por `catalog_status`, com badges, textos orientativos, aliases visíveis e seleção apenas visual.

Comportamento por status

- `existing`
  - badge `Existente no catálogo`
  - mostra nome sugerido, nome no catálogo, aliases, categoria e importância
  - texto: `Encontrada no catálogo. Pode ser usada com segurança no matching IA.`
- `new`
  - badge `Nova sugestão`
  - mostra nome sugerido, aliases, descrição, categoria e importância
  - texto: `Nova sugestão. Não será criada automaticamente no catálogo.`
- `conflict`
  - badge `Conflito — revisar`
  - mostra nome sugerido, aliases e possíveis matches em lista compacta expansível
  - texto: `Conflito de catálogo. Escolha manualmente a skill correta antes de confiar no matching.`

Defaults de seleção

- `existing`: marcado por padrão
- `new`: desmarcado por padrão
- `conflict`: desmarcado por padrão

Nesta fase, a seleção é apenas informativa. O botão `Aplicar ao formulário` continua usando os campos estruturados do draft (`mandatory_skills`, `nice_to_have_skills` e demais campos) exatamente como antes.

Catálogo

- não cria skill automaticamente;
- não resolve conflito automaticamente.

Compatibilidade

- backend não mudou;
- API não mudou;
- payload não mudou;
- `mandatory_skills` e `nice_to_have_skills` continuam sendo a base da aplicação ao formulário.

Testes executados

- `cd frontend && npm run test -- --run JobAiDraftPanel`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

Todos passaram.

Pendências para fase futura

- integrar a seleção visual das `suggested_skills[]` à aplicação estruturada no formulário, se isso for desejado;
- eventualmente permitir que skills `existing` selecionadas preencham campos estruturados do catálogo sem depender apenas dos textos do draft.
