## Objetivo

Adicionar uma aba `Performance` em `/admin/health` para consolidar budgets operacionais e sinais leves de performance sem criar rota nova nem depender de leitura de logs brutos no frontend.

## Por que usar `/admin/health`

- a tela já é a superfície administrativa de status técnico;
- evita fragmentar navegação com dashboard paralelo;
- permite reaproveitar o `overview` já carregado para contexto de saúde geral.

## Seções exibidas

- `Performance geral`
- `Pipeline`
- `Vagas`
- `Pré-admissão`
- `RAG / Base de Conhecimento`
- `IA / Usage`

## Dados reais vs budgets documentados

- `Status geral` usa apenas o `health overview` como contexto auxiliar para marcar `Atenção` ou `Crítico` quando a saúde geral já vier degradada.
- `Pipeline`, `Vagas`, `Pré-admissão` e `RAG` exibem budgets documentados e proteções por teste.
- `Riscos ativos` permanece como `Tempo real indisponível` porque não existe agregado confiável nesta fase.
- `IA / Usage` apenas aponta para a aba já existente de `IA / Tokens`, sem duplicar dados.

## Limitações

- a aba não mede latência real por fluxo;
- não lê logs do servidor;
- não expõe storage mode ao vivo do RAG;
- os status de budget são operacionais, não métricas de produção em tempo real.
