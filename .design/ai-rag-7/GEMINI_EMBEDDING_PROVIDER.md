# Gemini Embedding Provider — AI-RAG-7

## Contexto
Esta fase implementa a integração real com a API do Google Gemini para a geração de embeddings de alta qualidade. O sistema agora permite transicionar de vetores fakes (SHA-256 local) para vetores semânticos reais, mantendo total controle via feature flags.

## Mudanças Realizadas

### 1. GeminiEmbeddingProvider
- Localizado em `backend/src/ai_orchestration/rag/gemini_embedding_provider.py`.
- Implementa `EmbeddingProviderContract`.
- Utiliza os endpoints `:embedContent` (query única) e `:batchEmbedContents` (lote de chunks).
- **Segurança:** Erros da API são higienizados para não vazar chaves de API ou detalhes sensíveis em logs/mensagens de erro.
- **Validação:** Aplica o hardening de dimensões (AI-RAG-6A) em todas as respostas da API.

### 2. EmbeddingProviderFactory
- Centraliza a lógica de seleção de provedores.
- Garante que o `FakeEmbeddingProvider` continue sendo o padrão para desenvolvimento local e testes, a menos que explicitamente configurado.

### 3. Configurações (Feature Flags)
Adicionadas as seguintes variáveis ao `settings.py`:
- `RAG_EMBEDDING_PROVIDER`: Escolha entre `fake` ou `gemini`.
- `RAG_GEMINI_EMBEDDING_ENABLED`: Flag global de ativação do Gemini para RAG.
- `RAG_GEMINI_EMBEDDING_MODEL`: Padrão `text-embedding-004`.
- `RAG_GEMINI_EMBEDDING_DIMENSIONS`: Padrão `768`.

## Estratégia de Provedores
- **Embeddings:** **Gemini** (Google) é o provedor oficial devido ao balanço entre custo, performance e suporte nativo a lotes.
- **Raciocínio/Resposta:** **Claude** (Anthropic) permanece reservado para a geração final de texto e síntese de conhecimento em fases futuras.

## Como Ativar o Gemini Real
1. Defina `GOOGLE_API_KEY_1` no seu `.env`.
2. Configure as flags:
   ```env
   RAG_EMBEDDING_PROVIDER=gemini
   RAG_GEMINI_EMBEDDING_ENABLED=true
   ```
3. O sistema passará a usar vetores de 768 dimensões reais em vez de 16 dimensões fakes.

## Verificação e Testes
- **Mocks:** Todos os testes de integração com Gemini utilizam `httpx.AsyncClient` mockado. **Nenhuma chamada real à rede é feita durante a suíte de testes.**
- **Fallback:** Validado que a ausência de chaves ou configurações incorretas faz o sistema reverter para o modo `fake` com um aviso no log, em vez de quebrar o servidor.

## Riscos e Mitigações
- **Rate Limits:** O Gemini possui limites por minuto. O `GeminiEmbeddingProvider` atual não implementa retries complexos; isso deve ser tratado em fases futuras ou via middlewares de infraestrutura.
- **Custos:** A geração de embeddings consome cota/créditos da Google Cloud. A flag `ENABLED` permite desligar o consumo instantaneamente.
