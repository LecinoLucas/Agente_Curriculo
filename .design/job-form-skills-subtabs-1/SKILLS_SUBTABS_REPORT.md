# SKILLS_SUBTABS_REPORT

## Problema

A macro-etapa `Skills` do formulário de vaga concentrava assuntos demais em uma única área longa:

- skills essenciais do catálogo;
- skills diferenciais do catálogo;
- competências obrigatórias em texto livre;
- diferenciais em texto livre;
- atributos de peso, nível mínimo e anos mínimos;
- alertas e revisão.

Isso aumentava a rolagem, misturava competências estruturadas com texto livre e dificultava a leitura operacional do passo 3 de 5.

## Solução

Foi mantida a macro-etapa `Skills` no wizard principal e adicionada uma navegação interna por sub-abas dentro dela:

1. `Essenciais`
2. `Diferenciais`
3. `Competências livres`
4. `Revisão`

Cada sub-aba mostra apenas o assunto correspondente, preservando o mesmo estado do formulário e a mesma integração com as ações já existentes.

## Sub-abas criadas

### Essenciais

- Explicação curta sobre impacto no matching IA.
- Lista de skills essenciais do catálogo.
- Controles de `peso`, `nível mínimo` e `anos mínimos`.
- Ações `Tornar diferencial` e `Remover`.
- Indicador visual quando o conjunto essencial está abaixo do mínimo esperado.

### Diferenciais

- Explicação curta sobre impacto no ranking.
- Lista de skills diferenciais do catálogo.
- Controles de `peso`, `nível mínimo` e `anos mínimos`.
- Ações `Tornar essencial` e `Remover`.

### Competências livres

- Competências obrigatórias em texto livre.
- Diferenciais em texto livre.
- Requisitos comportamentais em texto.
- Aviso explícito de que texto livre não entra diretamente no matching IA.

### Revisão

- Resumo de totais de skills essenciais, diferenciais e textos livres.
- Alertas de qualidade já existentes.
- Aviso quando há menos de 3 skills essenciais.
- Aviso quando não há nenhuma skill de catálogo.
- Aviso quando só existem textos livres.

## O que mudou visualmente

- A etapa `Skills` deixou de ser um bloco único comprido.
- A navegação interna passou a separar claramente catálogo estruturado, texto livre e revisão.
- Os indicadores de contagem e alerta ficam visíveis já nas abas.

## Payload/API

- O payload final de criação/edição de vaga não mudou.
- Nenhum endpoint foi alterado.
- Nenhuma regra de matching, ranking ou preenchimento por IA foi alterada.

## Testes executados

- `cd frontend && npm run test -- --run JobFormPage`
  - Resultado: `52 passed`
- `cd frontend && npx tsc --noEmit`
  - Resultado: sem erros de TypeScript
- `cd frontend && npm run build`
  - Resultado: build concluído com sucesso

## Riscos restantes

- Baixo risco visual, porque a navegação depende de estado local da página.
- O comportamento funcional principal continua dependente dos componentes já existentes de skills, que foram preservados.
- As validações atuais continuam visíveis, mas seguem sendo feedback visual, não bloqueios novos.
