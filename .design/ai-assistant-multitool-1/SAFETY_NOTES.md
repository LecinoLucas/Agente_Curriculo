# Safety Notes

## Por que continua read-only

- Todos os planos compostos usam apenas intents já existentes e somente de leitura.
- A orquestração acontece no frontend com allowlist fixa.
- Não há planner com LLM, endpoint novo, tool nova ou escrita indireta.

## Ações proibidas

- contratar candidato
- rejeitar candidato
- mover no pipeline
- aprovar ou reprovar documento
- exportar para Protheus
- enviar e-mail ou mensagem
- alterar vaga, candidato ou admissão

## Como IDs são validados

- `job` exige `job_id`
- `candidate` exige `candidate_id`
- `admission` exige `admission_case_id`
- `protheus.export_status` só entra no plano com `package_id` válido já presente no contexto
- sem ID válido o plano não executa e o drawer mantém feedback amigável

## Por que não usa LLM planner

- esta fase precisa ser determinística e auditável
- as combinações de alto valor já são conhecidas
- a allowlist fixa reduz risco de desvio para intents não aprovadas

## Riscos restantes

- planos compostos ainda cobrem apenas perguntas previsíveis de maior valor
- um step read-only pode falhar por indisponibilidade operacional e gerar resposta parcial
- o resultado composto depende da qualidade dos presenters já existentes para cada intent
