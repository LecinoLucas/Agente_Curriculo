## Decisões de UI

### Não criar rota nova

`/admin/health` já concentra status técnico e consumo operacional. Adicionar a aba `Performance` mantém o contexto e evita outro ponto de navegação administrativa.

### Não duplicar `IA / Tokens`

A aba `Performance` só resume que a superfície de uso/custo existe e oferece atalho interno para `IA / Tokens`. O detalhamento de chamadas, tokens, custo e limites continua em um único lugar.

### Padrão visual usado

- cards compactos;
- badges de status;
- texto curto em PT-BR;
- layout em grade consistente com a tela atual.

Não foi criada visualização pesada, gráfico novo nem tabela extensa.

### Métricas não inventadas

Onde a aplicação não tem fonte agregada confiável:

- o texto usa `Budget definido`, `Protegido por teste` ou `Tempo real indisponível`;
- nenhum número sintético de latência, gargalo ou percentual de saúde é mostrado;
- a aba não infere sinais a partir de logs brutos.
