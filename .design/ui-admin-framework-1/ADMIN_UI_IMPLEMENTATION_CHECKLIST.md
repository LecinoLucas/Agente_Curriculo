# ADMIN UI Implementation Checklist

Use este checklist em toda tela administrativa densa antes de aprovar implementação ou review.

## Estado inicial

- [ ] A tela abre com lista ou tabela como foco principal?
- [ ] Existe formulário aberto por padrão?
- [ ] Existem chunks, logs ou documentos longos abertos por padrão?
- [ ] O primeiro viewport mostra a ação operacional principal com clareza?

## Hierarquia visual

- [ ] O header está compacto?
- [ ] Há no máximo um botão primário por seção?
- [ ] Ações principais e secundárias estão visualmente separadas?
- [ ] Cards estão resumindo, e não tentando editar?

## Ações e segurança

- [ ] Ação destrutiva exige confirmação?
- [ ] Ação destrutiva está discreta, sem dominar a tela?
- [ ] Detalhe abre sob demanda em modal ou drawer?
- [ ] Ações por linha estão compactas e previsíveis?

## Conteúdo longo

- [ ] Chunks não aparecem expandidos por padrão?
- [ ] Logs não aparecem expandidos por padrão?
- [ ] Documentos longos não aparecem abertos por padrão?
- [ ] O usuário consegue acessar detalhe completo apenas quando solicitar?

## Estados de interface

- [ ] Existe estado vazio útil?
- [ ] Existe loading claro?
- [ ] Existe erro amigável?
- [ ] Existe ação de retry quando aplicável?

## Dados sensíveis

- [ ] Dados sensíveis estão ocultos ou sanitizados?
- [ ] Previews resumidos não expõem payload interno?
- [ ] A tela evita exibir hashes, vetores, embeddings e segredos?

## Validação de qualidade

- [ ] Há teste provando o estado inicial da tela?
- [ ] O teste garante ausência de formulário aberto por padrão?
- [ ] O teste garante que detalhe aparece só por ação explícita?
- [ ] O comportamento inicial segue “lista primeiro, detalhe sob demanda”?

## Critério rápido de reprovação

Se qualquer resposta abaixo for “sim”, a tela precisa ser revista:

- [ ] A página abre editando em vez de listar?
- [ ] O conteúdo longo aparece sem o usuário pedir?
- [ ] Existem vários botões primários competindo?
- [ ] O layout parece amontoado de cards?
