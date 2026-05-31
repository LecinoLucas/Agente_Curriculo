# Design Review: IA Vaga Visual Mock

Reviewed against: [DESIGN_BRIEF.md](./DESIGN_BRIEF.md)
Date: 2026-05-30
Status: aprovado

## Screenshots Captured

- `.design/ia-vaga-visual-mock/screenshots/review-job-form-manual-desktop-1280.png`
- `.design/ia-vaga-visual-mock/screenshots/review-job-form-ai-panel-desktop-1280.png`
- `.design/ia-vaga-visual-mock/screenshots/review-job-form-ai-loading-desktop-1280.png`
- `.design/ia-vaga-visual-mock/screenshots/review-job-form-ai-draft-desktop-1280.png`
- `.design/ia-vaga-visual-mock/screenshots/review-job-form-ai-applied-desktop-1280.png`
- `.design/ia-vaga-visual-mock/screenshots/review-job-form-ai-draft-tablet-768.png`
- `.design/ia-vaga-visual-mock/screenshots/review-job-form-ai-draft-mobile-375.png`
- `.design/ia-vaga-visual-mock/screenshots/review-job-form-ai-applied-mobile-375.png`

## Resultado

O mock visual “Criar com IA” funciona bem no formulário autenticado em `/vagas/nova`. O fluxo está claro, não sugere automação indevida e preserva o cadastro manual como fluxo principal de revisão.

## Must-fix

- Nenhum.

## Should-fix

- Nenhum após o ajuste final.

## Could-improve

- [review-job-form-ai-applied-mobile-375.png](./screenshots/review-job-form-ai-applied-mobile-375.png): o stepper em mobile corta labels em `Conte...` e `Comp...`. Continua compreensível, mas está no limite da compactação.
- [review-job-form-ai-draft-mobile-375.png](./screenshots/review-job-form-ai-draft-mobile-375.png): os badges `Sem backend` e `Sem publicação automática` ficam corretos, mas já entram na zona de densidade alta em 375px.

## Checklist

### Toggle Cadastro manual / Criar com IA

- Aprovado.
- No desktop e mobile, o toggle aparece logo abaixo do header e antes do stepper, no lugar certo do fluxo.
- O estado ativo ficou coerente após aplicar o rascunho: [review-job-form-ai-applied-desktop-1280.png](./screenshots/review-job-form-ai-applied-desktop-1280.png).

### Painel de descrição

- Aprovado.
- O campo de descrição tem área suficiente no desktop e continua legível no mobile.
- O painel deixa claro que se trata de uma simulação visual, sem criar expectativa de backend real: [review-job-form-ai-panel-desktop-1280.png](./screenshots/review-job-form-ai-panel-desktop-1280.png).

### Botão Usar exemplo

- Aprovado.
- Está visível, discreto e não compete com a ação principal.
- Em mobile ele permanece acessível no canto superior direito do bloco de descrição: [review-job-form-ai-draft-mobile-375.png](./screenshots/review-job-form-ai-draft-mobile-375.png).

### Loading “Gerar exemplo com IA”

- Aprovado.
- O estado de loading aparece de forma explícita no botão e no placeholder do rascunho, sem saltos estranhos de layout: [review-job-form-ai-loading-desktop-1280.png](./screenshots/review-job-form-ai-loading-desktop-1280.png).

### Rascunho estruturado

- Aprovado.
- Hierarquia boa: título, badge de revisão, metadados, resumo e blocos escaneáveis.
- Em tablet, o conteúdo ainda usa bem a largura e não vira uma coluna longa demais: [review-job-form-ai-draft-tablet-768.png](./screenshots/review-job-form-ai-draft-tablet-768.png).
- Em mobile, o bloco continua legível e a ação principal permanece cedo o suficiente na rolagem: [review-job-form-ai-draft-mobile-375.png](./screenshots/review-job-form-ai-draft-mobile-375.png).

### Botão Aplicar ao formulário

- Aprovado.
- Está visível no fim do rascunho e semanticamente correto.
- Não parece salvar nem publicar; apenas transfere o rascunho para o formulário.

### Feedback “Rascunho aplicado. Revise antes de salvar.”

- Aprovado após polimento.
- O banner inline é suficiente e mais honesto que toast + banner ao mesmo tempo.
- O ajuste removeu duplicidade e eliminou sobreposição no mobile: [review-job-form-ai-applied-mobile-375.png](./screenshots/review-job-form-ai-applied-mobile-375.png).

### Formulário preenchido sem salvar/publicar

- Aprovado.
- Após aplicar, os campos reais aparecem preenchidos no formulário manual.
- O fluxo volta para `Cadastro manual` e o botão `Publicar` não aparece fora da etapa de revisão: [review-job-form-ai-applied-desktop-1280.png](./screenshots/review-job-form-ai-applied-desktop-1280.png).

### Responsividade desktop/mobile

- Aprovado.
- Desktop usa bem a largura e mantém leitura limpa.
- Tablet segura bem o draft sem excesso de ruído.
- Mobile não quebra horizontalmente e mantém CTA e formulário utilizáveis.

## Ajuste feito durante o review

- Removido o `toast.success(...)` no apply do rascunho em [JobFormPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/JobFormPage.tsx:731), mantendo apenas o banner inline de sucesso.

## Validação

- `npm --prefix frontend test -- --run src/pages/__tests__/JobFormPage.test.tsx` — passou (`35/35`)
- `npm --prefix frontend test -- --run src/features/jobs/__tests__/JobAiDraftPanel.test.tsx` — passou (`10/10`)
- `npm --prefix frontend run build` — passou
