# Regras de Negócio Corporativas

Versão das regras: `2026.04.v1`

## 1) Regras de Score

### 1.1 Dimensões e pesos

- `technical`: 35%
- `experience`: 30%
- `education`: 15%
- `communication`: 10%
- `leadership`: 10%

### 1.2 Fórmulas determinísticas

- Technical: `profundidade(50%) + amplitude(30%) + skills expert(20%)`
- Experience: `base_por_anos + bonus_lideranca - penalidade_gaps`
- Education: `nivel_base + bonus_relevancia + bonus_certificacoes (cap)`
- Communication: `estrutura(30%) + clareza(30%) + profissionalismo(20%) + completude(20%)`
- Leadership: soma de indicadores (`gestão=40`, `project_lead=30`, `mentoring=20`, `cross_team=10`)

### 1.3 Classificação de nível de análise

Com base no `overall_score`:

- `elite`: >= 85
- `strong`: >= 70 e < 85
- `solid`: >= 55 e < 70
- `developing`: >= 40 e < 55
- `risk`: < 40

## 2) Classificação de Senioridade

### 2.1 Sinal primário

- Classificação-base por anos de experiência:
  - `director`: >= 12
  - `principal`: >= 10
  - `lead`: >= 7
  - `senior`: >= 5
  - `mid`: >= 3
  - `junior`: >= 1
  - `intern`: < 1

### 2.2 Sinais de ajuste

- Palavras-chave de cargo podem elevar nível (não rebaixam por si só).
- Falta de gestão/liderança pode rebaixar níveis que exigem evidência organizacional.
- Proficiência técnica média baixa rebaixa níveis altos para evitar falso positivo.
- Conflitos entre sinais reduzem confiança (`high|medium|low`).

## 3) Compatibilidade com Vaga

### 3.1 Dimensões e pesos

- `mandatory_skills`: 40%
- `optional_skills`: 20%
- `seniority`: 20%
- `experience`: 10%
- `education`: 10%

### 3.2 Regras de cobertura de skills

- Skill ausente: 0 crédito
- Skill presente abaixo do mínimo: 50% crédito
- Skill presente atendendo mínimo: 100% crédito
- Skill acima do mínimo: 100% + marcação de excedente

### 3.3 Recomendação final

- `strong_match`: `score >= 82` e `mandatory_coverage >= 90%`
- `good_match`: `score >= 65` e `mandatory_coverage >= 75%`
- `potential`: `score >= 45` e `mandatory_coverage >= 50%`
- `not_recommended`: demais casos

## 4) Versionamento de Análises

### 4.1 Princípios

- Resultado de análise é imutável.
- Reanálise sempre cria novo `analysis_id`.
- Histórico nunca é sobrescrito.
- A combinação (`resume_version`, `prompt_template`, `ai_model`, `job`) define idempotência.

### 4.2 Política de delta

- `|Δ overall| >= 15`: significativo (alerta)
- `5 <= |Δ overall| < 15`: moderado (registro)
- `|Δ overall| < 5`: mínimo

## 5) Fluxos Completos

### 5.1 Fluxo A — Análise de currículo (score + senioridade)

1. Receber entrada estruturada da IA (`ExtractedResumeData`).
2. Calcular `ScoreBreakdown` por regras determinísticas.
3. Classificar senioridade com sinais combinados (`SeniorityClassifier`).
4. Classificar nível de análise (`elite/strong/solid/developing/risk`).
5. Gerar snapshot auditável:
   - `input_checksum`
   - `decision_trace`
   - `ruleset_version`
   - `details` (breakdown e reasoning)

### 5.2 Fluxo B — Match currículo x vaga

1. Receber skills e metadados do candidato.
2. Receber requisitos obrigatórios/opcionais da vaga.
3. Calcular score por dimensão e cobertura obrigatória.
4. Determinar recomendação final (`strong/good/potential/not_recommended`).
5. Persistir resultado com breakdown e snapshot auditável.

### 5.3 Fluxo C — Reanálise e versionamento

1. Receber scores da versão anterior e da nova versão.
2. Calcular delta por dimensão.
3. Classificar severidade da mudança e direção (`improvement/regression/neutral`).
4. Acionar alerta quando mudança significativa.
5. Registrar contexto de versão (modelo, prompt, vaga, hash de entrada).

## 6) Auditabilidade e Governança

Para cada decisão crítica, persistir:

- `ruleset_version`
- `input_checksum` (SHA-256 do payload de entrada)
- `decision_trace`
- resultados numéricos por dimensão
- recomendação final
- delta e severidade quando aplicável

Essa abordagem garante reprodutibilidade, rastreabilidade e explicabilidade para auditoria interna e compliance.
