# Captura de Uso de Tokens Gemini — AI-USAGE-2

## Objetivo
Melhorar a precisão das métricas de consumo de IA capturando o uso real de tokens reportado pelo provedor Google Gemini durante a síntese de respostas RAG.

## Implementação

### 1. Extração de UsageMetadata (Gemini)
O `GeminiRagSynthesisProvider` agora processa o campo `usageMetadata` da resposta da API do Gemini.
Mapeamento:
- `promptTokenCount` → `input_tokens`
- `candidatesTokenCount` → `output_tokens`
- `totalTokenCount` → `total_tokens`

### 2. Contrato Estruturado
Foi criado o dataclass `RagSynthesisProviderResult` em `answer_schemas.py` para substituir o retorno `str` puro, permitindo o transporte de metadados de tokens sem poluir a resposta textual.

### 3. Propagação e Registro
O `RagAnswerService` recebe o resultado estruturado e propaga os contadores de tokens para o `AIUsageService.record_usage`.

### 4. Fallback de Segurança
- Se `usageMetadata` estiver ausente ou parcial, o sistema registra `0` tokens e marca `usage_available=False` internamente (opcional).
- O sistema é resiliente a respostas parciais do Gemini.

## Privacidade e Segurança
- **Não armazenado**: Chunks, Prompts, Respostas brutas, API Keys, Content Hashes ou Vetores.
- **Sanitização**: Erros de rede continuam sendo sanitizados para remover segredos (`[REDACTED]`).
- **Redação**: A redação de PII (H-01) na resposta final permanece ativa.
