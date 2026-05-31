# Design Tokens: Portal do Candidato C1B

## Filosofia: MarajóRH Professional

Baseada em Dieter Rams com toque Escandinavo. Clareza funcional + acolhimento humano.
- Fundo branco, hierarquia tipográfica clara
- Marajó Red como único acento forte
- Cantos arredondados (8-12px em cards) — não é corporativo frio
- Sombras suaves (não flat, não dramático)
- Fonte: Plus Jakarta Sans — geométrica, amigável, profissional

## Tokens aplicados em `candidate-portal/src/styles/index.css`

### Cores
- `--color-primary`: #C62828 (Marajó Red)
- `--color-primary-hover`: #B71C1C
- `--color-primary-light`: #FFEBEE
- `--color-bg`: #FFFFFF
- `--color-surface`: #F9FAFB
- `--color-surface-secondary`: #F3F4F6
- `--color-border`: #E5E7EB
- `--color-border-subtle`: #F0F0F0
- `--color-text`: #111827
- `--color-text-secondary`: #4B5563
- `--color-text-muted`: #9CA3AF
- `--color-success`: #16A34A
- `--color-warning`: #D97706
- `--color-danger`: #DC2626
- `--color-info`: #2563EB

### Tipografia
- Família: Plus Jakarta Sans (Google Fonts)
- Base: 16px
- Scale: 12, 13, 14, 16, 18, 20, 24, 30, 36px

### Espaçamento
- Base 4px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px

### Border radius
- sm: 6px, md: 8px, lg: 12px, xl: 16px, 2xl: 24px, full: 9999px

### Sombras
- sm: card hover sutil
- md: card em repouso
- lg: modal / dropdown

### Modo escuro
- Não implementado nesta fase (portal público, mobile-first)
