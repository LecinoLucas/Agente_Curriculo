# Job AI Draft - Performance Audit Report

## Resumo Executivo
Auditoria concluída no fluxo de geração de vagas com IA (`Job Ai Draft`). A análise confirmou que o fluxo é robusto em termos de custo e consistência, mas existem gargalos arquiteturais de tempo (latência síncrona do provider) e pontos de melhoria de feedback (UX do tempo de espera no frontend).

## Conclusão
**Status:** OK com ressalvas de performance (PARCIAL).
A precisão de extração e a tarifação estão perfeitamente estancadas e seguras contra vazamento de tokens, porém a latência é alta e inteiramente repassada ao usuário (bloqueando a tela).

## Principais Gargalos
1. **Chamada Síncrona do Provedor:** A chamada para o Gemini (`ai.analyze`) é totalmente síncrona dentro da requisição HTTP do Backend. Se a IA demorar 15 segundos, o frontend fica em `loading` por 15 segundos sem streaming ou feedback parcial.
2. **Avaliação de Qualidade Acoplada:** O nó `evaluate_quality_node` (se estendido ou tornado pesado) roda sequencialmente, aumentando o Critical Path do LangGraph.
3. **Payload / Prompting Ineficiente:** O JSON Schema retornado obriga a IA a escrever arrays muito longos, consumindo tempo de decodificação (`output_tokens` é o maior gargalo de tempo em LLMs).

## Riscos
- **Rate Limits e Timeouts Silenciosos:** O adaptador atual do Gemini faz failover de chaves no erro 429, mas se o provedor engasgar, o usuário final tomará timeout HTTP após 60/90 segundos, recebendo apenas um toast genérico de erro no frontend, tendo gastado `input_tokens` caso a IA corte no meio.
- **Custos Indiretos (Cache Miss):** Vagas criadas a partir do mesmo JD base não aproveitam cache local; toda geração custa tokens novos.

## Recomendação de Próxima Fase
Avançar para uma fase de refatoração de performance focada em:
1. Paralelizar validações no LangGraph.
2. Introduzir Caching Baseado em Hash de Input.
3. Reduzir o output esperado do Prompt (menor JSON).
