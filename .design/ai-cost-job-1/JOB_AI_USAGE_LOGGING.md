# Registro de Custos de IA - Job AI Draft (Fase AI-COST-JOB-1)

## Resumo
Este documento detalha o comportamento de registro de uso de IA (`ai_usage_logs`) para a funcionalidade de Rascunho Inteligente de Vagas (`JobAiDraftService` e LangGraph).
A política estabelecida define que: **cada tentativa real de chamada ao provedor externo (Google Gemini) deve gerar no máximo 1 registro em `ai_usage_logs`.**

## Cenários e Comportamentos

### 1. Sucesso Completo
- **Condição:** O provedor de IA processa o prompt e retorna um JSON válido que é parseado e formatado com sucesso.
- **Log:** `status="success"`
- **Campos:** `input_tokens` e `output_tokens` capturados da resposta do provedor de IA.
- **Local (Procedural):** Após o parsing do JSON em `JobAiDraftService.generate`.
- **Local (LangGraph):** No nó `post_validate_node`, apenas quando todo o processo de geração e parsing foi concluído com sucesso.

### 2. Erro do Provedor de IA
- **Condição:** A chamada de rede para o provedor falha (ex: Timeout, Rate Limit, ou API Indisponível) levantando `AiDraftAIError`.
- **Log:** `status="error"`
- **Campos:** `input_tokens=0`, `output_tokens=0`, `error_message="usage_unavailable"`.
- **Local (Procedural):** Bloco `except Exception as e:` ao redor de `ai.analyze` (onde `isinstance(e, AiDraftParseError)` é Falso) em `JobAiDraftService.generate`.
- **Local (LangGraph):** No nó `generate_draft_node`, capturando a exceção do `ai.analyze`.

### 3. Erro de Parsing (JSON Inválido)
- **Condição:** O provedor responde com sucesso (consumindo tokens), mas o conteúdo devolvido não pode ser parseado como JSON, levantando `AiDraftParseError`.
- **Log:** `status="error"`
- **Campos:** `input_tokens` e `output_tokens` da resposta válida do provedor, `error_message="json_parse_error"`.
- **Local (Procedural):** Bloco `except Exception as e:` onde a exceção é identificada como `AiDraftParseError`.
- **Local (LangGraph):** No nó `parse_draft_node`, utilizando o campo `usage` que foi preservado no `JobAiDraftState`.

## Privacidade
Nenhum dado sensível é persistido na tabela `ai_usage_logs`. O sistema **não grava** os seguintes dados:
- `text_input`
- `ocr_text`
- `prompt`
- `response_text`
- `image`
- `CPF`
- `payload_json`
- `stack trace`

O objetivo do log é exclusivamente financeiro e de auditoria de uso/latência.

## Diferenças de Implementação LangGraph vs Procedural
Para manter a regra de "exatamente um registro por tentativa", a arquitetura LangGraph utiliza o dicionário de estado para carregar os metadados de uso (tokens) gerados na etapa de chamada da API e posterga a persistência de sucessos para a última etapa do grafo (`post_validate_node`). Erros intermedários registram a falha no exato nó que ela ocorre, interrompendo a execução sem criar duplicatas.
