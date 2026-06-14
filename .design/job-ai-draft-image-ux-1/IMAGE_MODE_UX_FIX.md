# IMAGE_MODE_UX_FIX

## Problema

No painel "Criar vaga com IA", a aba `Colar descrição` permanecia exibindo o bloco de upload de imagem abaixo do textarea. Isso duplicava a affordance de imagem e deixava a interface mais longa e confusa.

## Causa da redundância

O componente `JobAiDraftPanel` montava os dois `TabsContent` com `forceMount`. Com isso, o modo de texto e o modo de imagem continuavam presentes no DOM ao mesmo tempo, e a aba ativa não controlava de fato o conteúdo renderizado.

## Nova regra de renderização por aba

### Modo `Colar descrição`

- Exibe apenas:
  - microcopy de texto;
  - label `Descrição da vaga para IA`;
  - botão `Usar exemplo`;
  - textarea;
  - botão `Gerar com IA`.
- Não exibe:
  - `Enviar imagem da vaga`;
  - `Selecionar imagem`;
  - `Contexto adicional opcional`;
  - `Extrair e gerar rascunho`.

### Modo `Enviar imagem`

- Exibe apenas:
  - microcopy de imagem;
  - bloco `Enviar imagem da vaga`;
  - instrução sobre PNG/JPG/JPEG;
  - seletor de imagem;
  - `Contexto adicional opcional`;
  - botão `Extrair e gerar rascunho`;
  - aviso de revisão humana.
- Não exibe:
  - textarea `Descrição da vaga para IA`;
  - botão `Gerar com IA`;
  - `Usar exemplo`.

## Preservação de estado

A troca de abas não apaga:

- texto digitado;
- imagem selecionada;
- contexto adicional;
- rascunho já gerado.

## Testes

Cobertura atualizada em `frontend/src/features/jobs/__tests__/JobAiDraftPanel.test.tsx` para validar:

- modo inicial em texto;
- ausência do upload no modo texto;
- presença do upload no modo imagem;
- ausência do textarea no modo imagem;
- preservação de estado ao alternar abas;
- manutenção dos labels principais;
- ausência de chamadas de API durante a simples troca de abas.

## Confirmação de escopo

- Backend: não alterado.
- API: não alterada.
- Payload: não alterado.
- OCR: não alterado.
