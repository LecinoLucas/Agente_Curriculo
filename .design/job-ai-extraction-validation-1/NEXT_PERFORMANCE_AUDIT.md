# NEXT PHASE: JOB-AI-EXTRACTION-PERFORMANCE-1

**Objetivo da Próxima Fase:**
Auditar tempo de resposta, latência do LangGraph, tokens consumidos e otimização de cache/prompts no fluxo de criação de vagas com IA.

**Escopo Proposto:**
1. **Medição de Latência Base**: Mensurar tempo médio atual de execução ponta-a-ponta (do endpoint REST ao provedor IA e pós-validação).
2. **Otimização de Contexto (Tokens)**: Reduzir tamanho dos prompts no LangGraph para economizar input tokens sem degradar qualidade de extração (verificar se `system_prompt` está inchado).
3. **Paralelismo no LangGraph**: Avaliar se a extração de métricas de qualidade (`evaluate_quality_node`) pode ocorrer em paralelo ou assíncrona ao invés de bloquear a resposta.
4. **Cache / Deduplicação**: Avaliar se vagas idênticas devem usar cache temporário (hash check na entrada da imagem/texto) para bypassar chamada de IA cara.
5. **Teste de Carga Simulado**: Disparar batch com 10 requisições simultâneas para verificar se a fila/pool do provider sofre gargalos (rate limits, timeouts) e assegurar que fallback/retentativas locais (backoff) funcionem graciosamente.

**Por Que Isso É Necessário?**
Agora que a precisão (validação de extração, matriz de campos, regras de backfill e anti-discriminação) está **100% testada e passando (128 de 128)** e as falhas custeáveis são propriamente capturadas, o próximo funil natural antes de expor essa feature a mil recrutadores é garantir escalabilidade e economia por token sem onerar a AWS/Provedor IA.
