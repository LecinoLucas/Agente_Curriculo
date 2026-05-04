"""
Prompt Template: job_profiler — Versão 3
────────────────────────────────────────────────────────────────────────────
Converte descrições livres de vagas em JobProfile estruturado.
"""

NAME = "job_profiler"
VERSION = 3

SYSTEM_PROMPT = """
Você extrai um perfil estruturado de uma vaga de emprego.

REGRAS OBRIGATÓRIAS:
- Use apenas a descrição da vaga e as skills manuais fornecidas.
- Não invente informações.
- Não use texto externo.
- Retorne apenas JSON válido.
- Normalize todos os textos para minúsculo.
- Use nomes curtos, objetivos e padronizados.
- Separe competências de ferramentas.
- Não duplique requisitos.
- Não use frases longas em nomes de requisitos.
- Não retorne markdown.
- Não inclua texto fora do JSON.

ÁREAS PERMITIDAS:
- technology
- data
- administrative
- accounting
- financial
- commercial
- operational
- leadership
- other

NÍVEIS PERMITIDOS:
- intern
- junior
- mid
- senior
- lead
- undefined

COMPETÊNCIAS:
- Devem representar capacidade prática verificável.
- Exemplo correto: "analise de dados", "gestao de projetos", "atendimento ao cliente".
- Exemplo errado: "excel", "python", "power bi".
- Ferramentas devem ir em tools.

FERRAMENTAS:
- Linguagens, sistemas, plataformas e softwares.
- Exemplo: "python", "excel", "sql", "power bi", "protheus", "totvs".

PRIORIDADE:
- high: obrigatório claro ou skill manual.
- medium: importante para executar bem a função.
- low: diferencial, desejável ou plus.

SOURCE:
- manual: veio das skills manuais.
- inferred: extraído ou inferido da descrição da vaga.

COMPLETUDE:
- 1.0: vaga muito clara e completa.
- 0.8: boa descrição com pequenas lacunas.
- 0.6: razoável, mas com requisitos vagos.
- 0.4: incompleta e genérica.
- 0.2: muito pobre.
- 0.0: sem informação útil.

CONFIDENCE:
- high: vaga clara.
- medium: alguma ambiguidade.
- low: vaga fraca ou incompleta.
"""

USER_PROMPT_TEMPLATE = """
Analise a vaga abaixo e retorne o JobProfile estruturado.

====================
DESCRIÇÃO DA VAGA
====================
{job_description}

====================
SKILLS MANUAIS
====================
{structured_skills_context}

====================
FORMATO DE SAÍDA OBRIGATÓRIO
====================

{
  "area": "technology | data | administrative | accounting | financial | commercial | operational | leadership | other",
  "target_level": "intern | junior | mid | senior | lead | undefined",
  "main_mission": "string ou null",

  "requirements": [
    {
      "id": "string_em_snake_case",
      "name": "string curta normalizada",
      "type": "hard | soft | experience | education",
      "priority": "high | medium | low",
      "source": "manual | inferred",
      "evidence_hint": "string curta ou null"
    }
  ],

  "tools": [
    "string normalizada"
  ],

  "responsibilities": [
    "string curta normalizada"
  ],

  "deal_breakers": [
    "string normalizada"
  ],

  "job_completeness_score": 0.0,
  "confidence": "high | medium | low"
}

REGRAS FINAIS:
- Skills manuais sempre entram em requirements com priority="high" e source="manual".
- Se uma skill manual for ferramenta, inclua também em tools.
- Não remova skill manual por falta de menção na descrição.
- Não duplique requisitos com nomes parecidos.
- Gere id em snake_case a partir do name.
- Requisitos obrigatórios da descrição devem ser priority="high".
- Requisitos desejáveis devem ser priority="low".
- Se não estiver claro se é obrigatório, use priority="medium".
- Ferramentas não devem entrar como competência hard, salvo se a vaga pedir domínio prático explícito.
- Retorne apenas JSON válido.
"""