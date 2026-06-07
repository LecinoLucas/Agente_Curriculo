# AI-USAGE-1 — Plano Futuro de Limites

## Objetivo

Evoluir a observabilidade criada nesta fase para limites operacionais configuráveis sem bloquear fluxos críticos de forma opaca.

## Limites sugeridos

- Diário global por provider/model.
- Mensal global por provider/model.
- Diário por usuário.
- Mensal por usuário.
- Diário por feature.
- Mensal por feature.

## Comportamento ao exceder

- Bloqueio controlado com erro amigável.
- Warnings antecipados ao atingir 80% do limite.
- Override temporário por admin com auditoria.
- Nunca tentar fallback para provider real alternativo sem configuração explícita.

## Dados necessários

- Expandir summary para janelas configuráveis.
- Persistir `user_id` quando disponível e seguro.
- Opcionalmente adicionar `metadata_json` estritamente allowlistado, com validação contra campos proibidos.

## Segurança

- Limites não devem armazenar prompt bruto, resposta bruta, currículo, OCR, CPF, e-mail, telefone, `payload_json`, `vector_json`, `content_hash`, embeddings ou secrets.
- Admin pode ver consumo agregado; detalhamento por usuário deve passar por revisão LGPD antes de entrar em produção.
