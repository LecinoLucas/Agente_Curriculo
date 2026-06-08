# PRE-ADMISSION-CASE-AUTO-FIX-1 — Contract Decision

## Problema atual

Na transicao `hired -> pre_admission`, o contrato do pipeline nao pode sugerir abertura da pre-admissao sem um `pre_admission_case_id` valido.

O risco concreto era este:

```json
{
  "stage": "pre_admission",
  "required_action": "open_pre_admission",
  "pre_admission_case_id": null
}
```

Isso orienta o RH a abrir um workspace inexistente.

## Opcoes avaliadas

### 1. Permitir mover para `pre_admission` mesmo sem caso

- Mantem a pipeline andando.
- Deixa o RH sem workspace valido.
- Cria contrato ambiguo e UX ruim.

Decisao: rejeitada.

### 2. Criar caso vazio sem checklist

- Evita `case_id` nulo.
- Viola a regra de negocio do proprio fluxo admissional.
- Gera caso parcial/invalido.

Decisao: rejeitada.

### 3. Bloquear a transicao sem checklist padrao ativo

- Mantem integridade do contrato.
- Evita caso parcial.
- Retorna acao clara de configuracao.

Decisao: escolhida.

## Decisao escolhida

Regra obrigatoria:

```text
open_pre_admission so pode existir quando pre_admission_case_id for valido.
```

Se nao houver checklist padrao ativo:

- a transicao `hired -> pre_admission` e bloqueada;
- o candidato permanece em `hired`;
- nenhum caso admissional e criado;
- nenhuma acao Protheus e disparada;
- a API retorna erro controlado.

## Contrato final

### Com checklist padrao ativo

```json
{
  "stage": "pre_admission",
  "required_action": "open_pre_admission",
  "pre_admission_case_id": "uuid-valido"
}
```

### Sem checklist padrao ativo

```json
{
  "ok": false,
  "code": "DEFAULT_CHECKLIST_TEMPLATE_REQUIRED",
  "message": "Não há checklist admissional padrão ativo. Configure um checklist padrão antes de iniciar a pré-admissão.",
  "required_action": "configure_default_checklist_template",
  "pre_admission_case_id": null
}
```

## Observacao de frontend

Nenhuma mudanca de frontend foi necessaria nesta fase.

O frontend atual:

- ja nao navega para `/admissao/:id` quando `pre_admission_case_id` e nulo;
- exibe mensagem amigavel a partir do `message` do erro HTTP 409.
