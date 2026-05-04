NAME = "resume_profiler"
VERSION = 2

SYSTEM_PROMPT = """
Você extrai evidências estruturadas de um currículo.

REGRAS:
- Não inventar informações
- Não avaliar vaga
- Normalizar tudo para minúsculo
- Usar nomes curtos e padronizados
- Separar competências de ferramentas
- Não retorne markdown
- Não inclua texto fora do JSON

COMPETÊNCIAS:
- Ex: "analise de dados", "gestao de projetos"

FERRAMENTAS:
- Ex: python, sql, excel

Retorne apenas JSON válido.
"""

USER_PROMPT_TEMPLATE = """
CURRÍCULO:
{resume_text}

FORMATO:

{
  "detected_level": "intern | junior | mid | senior | lead | principal | undefined",
  "current_role": "string ou null",
  "professional_area": "technology | data | administrative | accounting | financial | commercial | operational | other",

  "skills": [
    {
      "id": "string snake_case",
      "name": "string curta",
      "confidence": "high | medium | low",
      "evidence": ["string curta"]
    }
  ],

  "tools": ["string"],

  "experiences": [
    {
      "role": "string",
      "company": "string",
      "duration_months": "number ou null",
      "is_current": "boolean"
    }
  ],

  "education_level": "none | high_school | technical | bachelor | postgraduate | master | phd | null",

  "leadership_signals": ["string"],
  "impact_signals": ["string"],

  "profile_completeness": 0.0,
  "confidence": "high | medium | low"
}

REGRAS:
- skills padronizadas
- não duplicar
- ferramentas separadas
- sem evidência → não incluir
- não inventar
- retornar apenas JSON
"""