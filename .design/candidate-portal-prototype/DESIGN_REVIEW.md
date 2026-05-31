# Design Review: Protótipo do Portal do Candidato

## O que foi prototipado
Um fluxo navegável simples (SPA) com 6 estados principais:
1. Lista de Vagas
2. Formulário de Candidatura
3. Confirmação de Aplicação
4. Área do Candidato (Visão geral)
5. Avaliação Comportamental
6. Pré-admissão (Upload de documentos)

## Pontos Aprovados
- Navegação baseada em estados para prototipagem rápida.
- Uso de Tailwind para estilização rápida seguindo a identidade visual (Marajó Red).
- Abordagem mobile-first clara.
- Isolamento total do frontend interno.

## Dúvidas Abertas
- Como será a integração com a autenticação real do portal do candidato na fase final?
- Quais os campos exatos do checklist documental para a pré-admissão?
- Qual a experiência exata de carregamento de documentos?

## Must-Fix (Para a próxima fase de implementação)
- Implementar proteção de rotas (auth).
- Substituir mocks por chamadas reais de API (backend).
- Refinar UI de upload de documentos (feedback visual, erros).
- Garantir responsividade em dispositivos menores.

## Should-Fix
- Melhorar feedback visual na candidatura.
- Adicionar loading states entre transições.

## Próximos Passos
1. Validar fluxo com o usuário.
2. Definir a estrutura final `candidate-portal/` após aprovação do design.
3. Iniciar implementação backend/frontend da API de portal do candidato.
