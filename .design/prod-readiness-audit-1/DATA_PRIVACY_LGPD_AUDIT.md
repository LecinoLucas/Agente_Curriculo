# Auditoria de Privacidade de Dados e LGPD

**Data:** 07/06/2026

## 1. Tratamento de CPF
- **APROVADO**: Armazenamento em hash: `cpf_identity.py` (L28) armazena a string bruta original do CPF de candidatos como hash SHA-256 (`cpf_hash`).
- **APROVADO**: Sanitização de Tela. No Frontend, o componente `aiAssistantSanitizer.ts` mascara e remove ativamente qualquer vestígio de CPFs e telefones da saída.
- **APROVADO**: `candidate_portal_service.py` possui funções dedicadas como `_mask_cpf()` para exibição segura.
- **ALERTA MÉDIO**: `admission_package_service.py` L416 inclui o CPF em raw plain-text nos payloads transferidos no JSON. Aceitável se houver acesso exclusivo pelo administrador, mas exige validação redobrada na observabilidade do endpoint.

## 2. Bloqueio de Metadados
- **APROVADO**: Campos do banco como `payload_json`, `vector_json`, `content_hash` e `embedding` são rigorosamente filtrados do frontend. A exclusão atua no nível de payload (`aiAssistantSanitizer.ts`).

## 3. Guardrails Antidiscriminatórios (Rascunho de Vagas)
- **APROVADO**: Regras pesadas (`job_ai_draft_rules.py`) evitam processamentos baseados em raça/etnia, gênero, religião, idade e aparência. Isso garante não só conformidade com a LGPD no que tange a "dados sensíveis", mas proteção contra viés algorítmico do modelo ao gerar rascunhos.
- **APROVADO**: Informações sigilosas internas (como orçamentos salariais confidenciais) são barradas caso a IA alucine sem que isso exista no texto de evidência real da vaga.
