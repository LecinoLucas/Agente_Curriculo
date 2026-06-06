# Síntese de Resposta RAG com Fontes — AI-RAG-10

## Contexto
Esta fase implementa a camada de geração de texto (síntese) para o sistema RAG. Utilizando o Google Gemini, o sistema agora é capaz de transformar trechos recuperados da base de conhecimento em respostas textuais explicativas, mantendo a rastreabilidade através de citações estruturadas.

## Mudanças Realizadas

### 1. Answer Schemas (`answer_schemas.py`)
- Definidos os contratos `RagAnswerRequest` (query + chunks) e `RagAnswerResult` (resposta + fontes).
- Introduzido o objeto `RagSource` para carregar metadados seguros da fonte utilizada.

### 2. Prompt Engineering (`rag_prompting.py`)
- Implementada gestão centralizada de prompts.
- **Guardrails:** Instruções estritas para fidelidade total às fontes, proibição de invenção (*hallucination*) e isolamento contra injeção de comandos presentes nos documentos recuperados.

### 3. Gemini Synthesis Provider (`gemini_rag_synthesis_provider.py`)
- Wrapper para a API `generateContent` do Gemini.
- Configurado com **baixa temperatura** (0.1) para garantir respostas determinísticas e factuais.
- Higienização automática de erros para evitar vazamento de chaves.

### 4. RagAnswerService (`rag_answer_service.py`)
- Orquestrador principal da síntese.
- **Deduplicação e Filtragem:** Garante que metadados sensíveis (CPF, salários, notas internas) sejam removidos antes de qualquer dado ser enviado para o provedor de LLM.
- **Controle de Carga:** Limita o número de chunks enviados para o contexto do modelo para otimizar custos e tempo de resposta.

### 5. Feature Flags (`settings.py`)
- `RAG_SYNTHESIS_ENABLED`: **Desligado por padrão**. A síntese só ocorre se explicitamente ativada.
- `RAG_GEMINI_SYNTHESIS_MODEL`: Padrão `gemini-2.0-flash`.

## Decisões Arquiteturais
- **Provedor Único:** Consolidamos o uso do **Gemini** tanto para embeddings quanto para síntese nesta fase, visando eficiência de custo e simplicidade de infraestrutura.
- **Claude (Anthropic):** O suporte ao Claude permanece planejado mas não implementado, visando controle de custos operacionais imediatos.
- **Sem Resposta sem Evidência:** Se o RAG não recuperar chunks relevantes, o sistema retorna uma resposta padrão de "evidência insuficiente" em vez de tentar responder com conhecimento genérico do modelo.

## Verificação e Testes
- **Backend (Synthesis):** Suítes de teste completas para Prompting, Provider (Mockado) e Service.
- **Isolamento:** Nenhuma chamada real à rede é feita nos testes.
- **Segurança:** Validado que a troca de provedor fake -> real não vaza segredos.

## Próximos Passos
- **Fase AI-RAG-11:** Integração da síntese no `AssistantRouter` através de um novo intent `knowledge.answer` ou extensão do fluxo de busca atual.
- **Fase AI-RAG-12:** Implementação de suporte a histórico (memória) para conversas multi-turno na base de conhecimento.
