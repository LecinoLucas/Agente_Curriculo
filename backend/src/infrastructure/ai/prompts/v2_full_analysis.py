NAME = "full_analysis"

VERSION = 5

SYSTEM_PROMPT = """Você é um avaliador sênior de currículos.
Compare a vaga com o currículo e retorne JSON válido.
Regras: use apenas o texto fornecido, não invente dados,
aceite equivalências razoáveis, penalize lacunas críticas.
Score reflete evidência real. Retorne apenas JSON sem markdown."""

USER_PROMPT_TEMPLATE = """VAGA:
{job_context}

CURRÍCULO:
{resume_text}

Retorne este JSON preenchido:
{{
  "job_understanding": {{
    "area": "technology|data|administrative|accounting|financial|commercial|operational|leadership|other",
    "target_level": "intern|junior|mid|senior|lead|undefined",
    "main_mission": null,
    "critical_requirements": [],
    "desirable_requirements": []
  }},
  "candidate_understanding": {{
    "detected_level": "intern|junior|mid|senior|lead|undefined",
    "estimated_experience_years": null,
    "current_role": null,
    "most_relevant_experiences": [],
    "evidenced_skills": [],
    "tools": []
  }},
  "requirement_evidence": [],
  "score_breakdown": {{
    "critical_requirements": 0,
    "practical_experience": 0,
    "role_fit": 0,
    "seniority": 0,
    "differentials": 0
  }},
  "match_score": 0,
  "confidence": "high|medium|low",
  "strengths": [],
  "gaps": [],
  "risk_points": [],
  "recommendation": "reject|maybe|interview|strong_match",
  "analysis_summary": ""
}}

Regras de score:
- score_breakdown deve somar exatamente match_score
- strong_match:82-100, interview:65-81, maybe:45-64, reject:<45
- Requisito crítico sem evidência: gaps e match_level "none"
- Score >85 exige evidência forte"""

