# Candidate Portal Architecture

**Status**: Fase 21.1 - Arquitetura final aprovada antes da implementação  
**Data**: 2026-04-28  
**Revisão**: 1.0

---

## 1. Visão Geral

O Portal do Candidato é uma superfície externa, separada do sistema interno do ATS, destinada exclusivamente ao acompanhamento do processo seletivo pelo próprio candidato.

Este portal adota autenticação passwordless com magic link gerado internamente. O objetivo do MVP é oferecer acesso seguro e simples a informações do processo sem reutilizar as premissas de autenticação, autorização ou navegação do sistema interno.

Princípios arquiteturais:

- O portal do candidato é um contexto separado do ATS interno.
- Autenticação do portal e autenticação interna são independentes.
- O candidato acessa apenas seus próprios dados.
- O portal não expõe dados internos sensíveis, operacionais ou analíticos.

---

## 2. Escopo do MVP

### Incluído no MVP

- Acesso por magic link gerado internamente.
- Dashboard básico do candidato.
- Visualização de status/processo seletivo.
- Timeline simplificada de eventos relevantes.
- Visualização de documentos solicitados e enviados.

### Fora do MVP

- Senha.
- Reset de senha.
- Request-link público.
- Chat.
- Integração com WhatsApp/Twilio.
- Proposta.
- Assinatura digital.
- Feedback gerado por IA.
- Score.
- Ranking.

---

## 3. Modelo de Domínio

### Entidades e responsabilidades

**Candidate**

- Representa a pessoa que participa do processo seletivo.
- É a entidade principal do domínio de recrutamento.
- Pode existir sem conta de portal.

**User**

- Representa usuário interno do ATS.
- É usado por admin, recruiter e outros perfis internos.
- Não é a base de autenticação do portal candidato.

**CandidateAccount**

- Representa a conta oficial do portal do candidato.
- É a entidade própria de acesso externo.
- Fica vinculada a exatamente um `Candidate`.

### Relação entre Candidate e User

`Candidate.user_id` deve ser tratado apenas como bridge legada/futura e não como base estrutural do portal candidato.

Decisão final:

- O portal será modelado sobre `CandidateAccount`.
- `Candidate.user_id` não define a identidade oficial de acesso do portal.
- Eventual uso de `Candidate.user_id` permanece apenas como compatibilidade transitória ou ponte de migração.

---

## 4. Autenticação

O Portal do Candidato usa autenticação passwordless baseada em magic link.

### Regras

- O login ocorre por magic link.
- O token do magic link é one-time use.
- O token possui expiração.
- O token persistido no banco deve ser armazenado como HMAC-SHA256 do valor original.
- A sessão autenticada do portal usa JWT separado do sistema interno.
- O JWT do portal deve usar `issuer="candidate-portal"`.
- O segredo do JWT do portal deve ser separado, via `JWT_CANDIDATE_SECRET`.
- A sessão deve ser entregue por cookie `httpOnly` com `SameSite`.

### Separação de contextos

- O token de magic link serve apenas para ingresso no portal.
- O JWT do portal serve apenas para rotas do portal.
- O JWT interno do ATS não é válido no portal.
- O JWT do portal não é válido nas rotas internas.

---

## 5. Banco Futuro

O MVP deve preparar a base para duas tabelas dedicadas ao portal.

### CandidateAccount

- `id`
- `candidate_id` unique not null
- `email` snapshot
- `status`: `pending`, `active`, `archived`, `revoked`
- `last_access_at`
- `created_at`
- `updated_at`

### CandidatePortalToken

- `id`
- `candidate_account_id`
- `token_hash`
- `type`: `magic_link`
- `expires_at`
- `used_at`
- `used_by_ip`
- `created_at`

### Observações de modelagem

- `CandidateAccount` é a fonte oficial de identidade externa do portal.
- O email armazenado em `CandidateAccount` é um snapshot operacional do acesso no momento da conta.
- Tokens devem ser auditáveis e inutilizáveis após uso ou expiração.

---

## 6. Endpoints Planejados

### Autenticação

- `POST /api/v1/portal/auth/join`
- `POST /api/v1/portal/auth/logout`

### Portal

- `GET /api/v1/portal/me`
- `GET /api/v1/portal/process`
- `GET /api/v1/portal/documents`
- `POST /api/v1/portal/documents`

### Intenção funcional

- `join`: valida magic link, consome token e estabelece sessão do portal.
- `logout`: encerra a sessão do portal.
- `me`: retorna dados resumidos da conta e do candidato autenticado.
- `process`: retorna status atual e timeline simplificada.
- `documents`: lista documentos solicitados/enviados e permite envio no escopo permitido do MVP.

---

## 7. Segurança

### Isolamento de autenticação e autorização

- JWT interno não acessa portal.
- JWT portal não acessa rotas internas.
- Contas `archived` e `revoked` não acessam o portal.

### Escopo de dados

- Toda query do portal deve ser filtrada por `candidate_id`.
- O portal nunca deve expor score, ranking ou saída bruta de IA.
- O portal deve expor apenas dados necessários para acompanhamento pelo candidato.

### Hardening

- Rate limit fica definido como hardening posterior, fora do escopo de implementação desta fase documental.

---

## 8. Roadmap Aprovado

- `21.2`: banco e models do portal
- `21.3`: repositories e services
- `21.4`: autenticação
- `21.5`: endpoints
- `21.6`: hardening
- `21.7`: auditoria
- `22`: frontend

---

## 9. Decisões Arquiteturais Consolidadas

1. O Portal do Candidato é um sistema externo ao ATS interno, ainda que compartilhe o mesmo ecossistema de produto.
2. O MVP não terá autenticação por senha em nenhuma forma.
3. `CandidateAccount` é a conta oficial do portal e substitui a dependência estrutural de `User`.
4. `Candidate.user_id` permanece apenas como bridge legada/futura, sem papel central na arquitetura do portal.
5. O portal terá JWT próprio, segredo próprio e issuer próprio.
6. O acesso do candidato é estritamente limitado aos próprios dados vinculados ao seu `candidate_id`.
7. O MVP não inclui comunicação conversacional, proposta, assinatura, score ou transparência de artefatos internos de IA.

---

## 10. Limites Desta Fase

Esta fase registra apenas a arquitetura aprovada.

Não faz parte desta entrega:

- Implementar código.
- Criar models.
- Criar migrations.
- Alterar backend.
- Alterar frontend.

