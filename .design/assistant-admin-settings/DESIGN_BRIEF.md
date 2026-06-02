# OP-6H-3A — Design Brief — Textos, Fallbacks e Quick Replies do Assistente

Data: 2026-06-02
Status: **Planejamento (sem código).** Continuação direta de
`.design/candidate-assistant-admin/` (Abas 1 Conversas e 4 Falhas já implementadas).
Esta fase desenha a **Aba 2 — Fluxo de perguntas** e a **Aba 5 — Configurações**:
edição de **conteúdo** do Assistente do Candidato, **nunca** da topologia da máquina
de estados.

## Problema

Hoje todo o texto do assistente — saudação inicial, pergunta de cada estado, quick
replies e mensagens de fallback — está **hardcoded** em dois arquivos do backend:

- `backend/src/application/services/conversation_state_machine.py`
  (`prompt_for`, `STATE_TRANSITIONS`, quick replies por estado).
- `backend/src/application/services/conversation_service.py`
  (mensagens de fallback `_INVALID_*`, copy de IDENTIFY/OTP, `_FAILURE_ATTEMPT_LIMIT = 3`).

Qualquer ajuste de redação, limite de tentativas ou rótulo de botão exige deploy de
código. O RH não tem autonomia para corrigir uma frase confusa que está gerando
falhas (visíveis na Aba 4).

## Objetivo

Permitir que admin/RH **editem o conteúdo** do assistente por estado e algumas
**configurações globais**, com validação forte e auditoria, sem nunca poder:

- criar/remover transições ou estados (topologia é fixa e vive na engine);
- quebrar o avanço da conversa (prompt vazio, quick reply sem valor reconhecido,
  placeholder corrompido);
- expor ou injetar PII;
- fazer a IA reprovar/contratar ou mover pipeline.

## O que o admin PODE configurar (futuro, planejado aqui)

| Item | Onde mora | Observação |
| --- | --- | --- |
| Texto inicial (saudação) | conteúdo do estado `IDENTIFY` + setting `assistant_enabled` | |
| Pergunta por estado (`prompt_text`) | `assistant_state_contents` | preserva placeholders |
| Texto auxiliar (`helper_text`) | `assistant_state_contents` | opcional |
| Quick replies permitidas | `assistant_quick_replies` | rótulo/ordem/ativo; **valor** do catálogo fixo |
| Fallback por estado (`fallback_text`) | `assistant_state_contents` | |
| Limite de tentativas | `max_attempts` por estado + setting global default | faixa 1–10 |
| Mensagem "Falar com RH" | setting `talk_to_hr_message` + `offer_hr_after_attempts` | handoff real é OP-6H-4 |

## O que o admin NÃO pode (inegociável)

- Criar transição livre / mudar `STATE_TRANSITIONS`.
- Apagar estado ou criar estado novo.
- Editar/apagar histórico de conversa (`conversation_messages`) ou auditoria.
- Permitir IA reprovar/contratar.
- Alterar pipeline automaticamente / mexer em `CandidateApplication`.
- Expor CPF / telefone / e-mail (completos), `cpf_hash`, ou `context_json` cru.
- Inventar `value` de quick reply fora do catálogo que a engine entende.
- Habilitar WhatsApp antes de a engine suportar o canal.

## Princípio central

> **A engine é a única fonte de verdade do fluxo. O painel edita só conteúdo.**
> Topologia (estados + transições) permanece em `conversation_state_machine.py`.
> Conteúdo (texto/quick replies/limites) passa a ser **dado**, lido pela engine com
> *fallback* para os valores hoje hardcoded (que viram o seed da migração).

## Personas

- **Admin** (RBAC `admin`): edita settings globais sensíveis (`assistant_enabled`,
  `channels_enabled`, limites) e conteúdo.
- **RH** (`hr`): edita conteúdo/redação e quick replies (a confirmar se também
  settings — recomendação: conteúdo sim, settings globais sensíveis só admin).
- **Recruiter/Viewer**: sem acesso a esta aba.

## Critérios de sucesso

1. Editar a pergunta de `CHOOSE_LOCATION` no painel muda o que o candidato vê no
   próximo turno, **sem deploy**.
2. Tentar salvar um prompt vazio, um `max_attempts = 0`, ou remover um placeholder
   obrigatório é **rejeitado** pela API com mensagem clara.
3. Nenhuma edição altera a ordem/transição dos estados.
4. Toda alteração fica registrada em auditoria (antes/depois) e é reversível.
5. Os testes existentes da conversa continuam verdes (seed = strings atuais;
   loader com fallback para o código).

## Não-objetivos desta fase

- Implementar qualquer código, migration, modelo, endpoint ou tela.
- Handoff real para RH (OP-6H-4).
- Catálogo de intenções / IA interpretadora (Aba 3).
- Multicanal WhatsApp.

## Entregáveis (documentação)

`DESIGN_BRIEF.md` · `DATA_MODEL.md` · `API_CONTRACT.md` ·
`STATE_CONTENT_MODEL.md` · `FRONTEND_PLAN.md` · `RISKS_AND_GUARDS.md` · `TASKS.md`
