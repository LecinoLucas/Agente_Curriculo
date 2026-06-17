# Plano de melhoria

## Fase 1: ajustes rápidos de clareza visual

- Padronizar os termos da tela para reduzir ambiguidade entre grupo, unidade, filial, posto e localidade.
- Renomear labels críticos:
  - `Grupo operacional`
  - `Código interno`
  - `Unidade operacional`
  - `Nome público exibido ao candidato`
- Mostrar na listagem principal os campos que impactam o portal:
  - `nome público`
  - `ponto de referência`
- Exibir grupo por código e nome, não só por código.

## Fase 2: proteção contra cadastro errado

- Adicionar confirmação antes de inativar grupo, localidade ou unidade.
- Informar o impacto operacional da inativação antes de confirmar.
- Melhorar feedback de erro no frontend com mensagens específicas vindas do backend.
- Adicionar hints/microcopy nos campos sensíveis:
  - `nome público`
  - `código interno`
  - `grupo pai`

## Fase 3: indicadores de uso da unidade em vagas/candidatos

- Exibir quantidade de vagas vinculadas à unidade.
- Exibir quantidade de candidaturas/pipeline em andamento associadas.
- Exibir quantidade de casos admissionais/pre-admission em uso.
- Bloquear ou elevar severidade da inativação quando houver dependência ativa.

## Fase 4: preparação visual para Protheus

- Separar visualmente “dados operacionais” de “dados técnicos/ERP”.
- Reservar espaço para:
  - empresa/grupo Protheus
  - filial Protheus
  - centro de custo
  - departamento
  - status de configuração ERP
- Evitar que o modal atual vire um formulário único denso e sem hierarquia.

## Fase 5: melhorias avançadas de responsividade/acessibilidade

- Melhorar apresentação mobile/tablet para tabela com muitos campos.
- Reforçar foco de teclado, descrições auxiliares e leitura de erros.
- Criar visualização mais escalável para bases maiores, com paginação/agrupamento.
- Adicionar estados vazios mais orientativos e consistentes com o fluxo operacional real.
