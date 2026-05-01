# AdaptiveScorer - Fase 5

## O que esta fase faz

O `AdaptiveScorerService` calcula o `match_score` final de forma determinística usando:

- `JobProfile`
- `CandidateProfile`
- `EvidenceMapping`

Ele não chama IA, não altera o ranking legado e não substitui o `JobCompatibilityCalculator`.

## Diferença para o fluxo antigo

O fluxo antigo do ranking usa `JobCompatibilityCalculator`, que foi desenhado para o modelo legado de compatibilidade por skills e senioridade.

O `AdaptiveScorer`:

- usa perfis estruturados mais ricos;
- trabalha com evidência já mapeada;
- aceita equivalência profissional controlada;
- separa score final de confiança e risco;
- produz trilha auditável por dimensão e por requisito.

Em outras palavras, o ranking antigo responde "bate ou não bate com a vaga";
o `AdaptiveScorer` responde "quais evidências sustentam esse match e com que força".

## Fórmula resumida

1. Cada requisito recebe score base:
   - `meets` = 100
   - `exceeds` = 100
   - `partially_meets` = 65
   - `unclear` = 40
   - `not_evidenced` = 0

2. O score do requisito é multiplicado por:
   - tipo de match: `direct`, `equivalent`, `inferred`, `absent`
   - força da evidência: `very_high`, `high`, `medium`, `low`, `none`

3. Os itens são agrupados em dimensões:
   - `technical_competencies`
   - `practical_experience`
   - `role_fit`
   - `seniority_alignment`
   - `education`
   - `leadership_evidence`

4. Cada dimensão é combinada com pesos adaptativos da vaga.

5. O `confidence_score` é calculado separadamente com:
   - completude do candidato
   - completude da vaga
   - confiança do evidence mapping
   - densidade de evidências

## Quando ativar no ranking

A ativação futura deve ocorrer apenas quando:

- a calibração dos thresholds estiver estável;
- houver comparação lado a lado com o ranking legado por um período de observação;
- existirem métricas de regressão para casos reais e casos de borda;
- o time confirmar que o novo score substitui bem o comportamento atual.

O ponto de troca natural é onde hoje o ranking chama o `JobCompatibilityCalculator`.

## Riscos antes da substituição

- Perfis incompletos ainda podem gerar score útil, mas com confiança menor.
- Vagas pouco descritas podem deixar o score menos confiável.
- A tabela de pesos por área pode exigir ajuste fino por domínio.
- A semântica de equivalência precisa ser mantida consistente entre matcher e scorer.
- O ranking legado e o novo scorer não devem ser misturados sem feature flag.

## Observação operacional

Esta fase não exige migração de banco.
Se o backend estiver com reload ativo, o novo código entra sem ação manual.
