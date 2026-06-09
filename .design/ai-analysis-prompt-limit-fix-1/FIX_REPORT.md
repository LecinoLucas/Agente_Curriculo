# Fix Report - AI Analysis Prompt Limits

## Causa Raiz
O worker de análise (`analysis_tasks.py`) possuía constantes hardcoded extremamente restritivas para o tamanho do prompt:
- `MAX_RESUME_PROMPT_CHARS = 2500`
- `MAX_JOB_PROMPT_CHARS = 700`
- `MAX_PROMPT_TOTAL_CHARS = 4500`

Esses valores eram insuficientes para o Gemini 2.5 Flash, que suporta prompts muito maiores. Como resultado, ao receber um currículo comum ou requisitos de vaga com descrições normais (que facilmente excedem 4500 caracteres), o sistema bloqueava a chamada à IA lançando um `RuntimeError`. Sendo um `RuntimeError` genérico, a exceção subia pelo sistema e causava uma falha que acabava categorizada como `unexpected_error` no provedor, impedindo reanálises fáceis e sujando a base.

## Limites Atualizados
Os limites foram movidos para variáveis de configuração global em `settings.py` e expandidos para valores adequados ao uso em produção com LLMs modernos:
- `AI_ANALYSIS_MAX_PROMPT_CHARS` aumentado para **30000**
- `AI_ANALYSIS_MAX_RESUME_CHARS` aumentado para **25000**
- `AI_ANALYSIS_MAX_JOB_CHARS` aumentado para **5000**

Com 30,000 caracteres como limite total, até mesmo currículos longos podem ser analisados em segurança sem causar falsos positivos na proteção de tamanho da string.

## Comportamento Antes vs Depois

### Antes:
- Prompts com mais de 4500 caracteres sofriam hard stop lançando `RuntimeError`.
- `RuntimeError` era capturado genericamente, marcando `provider_error_type="unexpected_error"`.
- As análises entravam num estado que exigia "Force Reanalyze" (`force=True`) para tentar de novo, o que a interface comum não fazia transparentemente.

### Depois:
- O novo limite (`30000`) atende perfeitamente a vasta maioria dos casos reais.
- Se o limite for de fato estourado (o que denota um documento possivelmente malicioso ou absurdamente massivo), uma exceção controlada customizada é lançada: `AnalysisPromptTooLargeError`.
- Essa exceção é capturada em `_classify_analysis_exception` e tipificada adequadamente como não temporária e como `provider_error_type="prompt_too_large"`.
- A reanálise de análises `failed` agora pode ser feita de forma suave (foi adicionada regra em `RequestAnalysisUseCase` que quebra intencionalmente a chave de idempotência se a análise anterior houver falhado, garantindo uma nova submissão via enfileiramento padrão).

## Rotina de Saneamento
Foi desenvolvido um script (`backend/scripts/sanitize_prompt_errors.py`) que localiza análises e logs de auditoria marcados como `unexpected_error` e que tiveram "prompt_chars_exceeded" e converte o erro de volta para o estado mais limpo e tratável (`prompt_too_large`). Saneamento rodou e limpou 7 análises defeituosas do ambiente local.

## Testes Executados
Foram mantidos e corrigidos os testes da suíte local que dependiam do fluxo de análise assíncrona, além de checagens unitárias do `request_analysis`.
- Modificados `SimpleNamespace` em testes de `test_candidate_portal_and_public_analysis.py` para injetarem mock correto aos metadados do documento PDF, ajustando com as últimas implementações do projeto.
- Testes rodaram via `pytest` com sucesso.

## Riscos Restantes
Nenhum risco substancial. A submissão da análise está protegida com exceções semânticas que não quebram o pipeline e com logs limpos de dados sensíveis (PDI intacto).
