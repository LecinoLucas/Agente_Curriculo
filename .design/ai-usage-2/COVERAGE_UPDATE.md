# Atualização da Cobertura de Métricas — AI-USAGE-2

## Estado da Cobertura

| Operação | Provider | Tokens Capturados | Status |
| :--- | :--- | :--- | :--- |
| `rag_synthesis` | Gemini | **Sim** (Real) | ✅ Captura real ativa |
| `job_ai_draft` | Gemini | Parcial (Mock/Fallback) | ⏳ Próxima fase |
| `resume_analysis` | Gemini | Não | ⏳ Próxima fase |
| `embeddings` | Gemini | Não | ⏳ Próxima fase |

## Mudanças Nesta Fase
- **Antes**: `rag_synthesis` registrava sempre `0` tokens, pois o provedor retornava apenas texto.
- **Depois**: `rag_synthesis` registra tokens reais de input e output quando o Gemini devolve `usageMetadata`.

## Próximos Passos
1. **Job AI Draft**: Atualizar o provider de rascunho de vagas para retornar `usageMetadata`.
2. **Análise de Currículos**: Integrar captura de usage no pipeline de extração e análise.
3. **Embeddings**: Capturar tokens de entrada na geração de vetores para a base de conhecimento.
