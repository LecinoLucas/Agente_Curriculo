"""Behavioral evaluation prompt construction.

Extracted from BehavioralAIEvaluationService._build_evaluation_prompt.
Do NOT alter prompt semantics — any change here affects all behavioral evaluations.
"""
from __future__ import annotations

from src.ai_orchestration.behavioral.behavioral_contracts import BehavioralEvaluationInput

SYSTEM_PROMPT = (
    "Você é um especialista em análise comportamental assistida por IA para recrutamento. "
    "Forneça análise baseada em evidências, sem fazer julgamentos, diagnósticos ou decisões de contratação."
)


def build_evaluation_prompt(evaluation_input: BehavioralEvaluationInput) -> str:
    """Build the user prompt for behavioral assessment AI evaluation.

    GUARDRAILS (must not be removed):
    - No approvals/rejections
    - No clinical/diagnostic language
    - Evidence-based language only
    - No eliminatory scoring
    """
    qa_text = "\n".join([
        f"- **{qa.competency} ({qa.answer_type})**: {qa.question}\n"
        f"  Answer: {qa.answer}"
        for qa in evaluation_input.questions_and_answers
    ])

    competencies_text = ", ".join(evaluation_input.competency_names)

    return f"""Você é um especialista em análise comportamental assistida por IA para processos de recrutamento.

Sua tarefa é ANÁLISE ASSISTIDA, não tomada de decisão. A análise deve ajudar o recrutador a entender o candidato melhor.

RESPOSTAS COMPORTAMENTAIS DO CANDIDATO:
{qa_text}

COMPETÊNCIAS DO TEMPLATE: {competencies_text}

INSTRUÇÕES CRÍTICAS:
1. Proibido: aprovar, reprovar, fazer diagnósticos, usar linguagem clínica
2. Obrigatório: usar linguagem baseada em evidências ("há sinal de...", "não há evidência suficiente...")
3. Forneça sinais por competência, não notas
4. Identifique pontos a validar na entrevista
5. Marque respostas insuficientes
6. Não calcule score eliminatório

Responda com JSON válido neste formato exato:
{{
  "confidence": "low|medium|high",
  "summary": "Resumo operacional curto do perfil comportamental",
  "competency_signals": [
    {{
      "competency": "Nome da Competência",
      "signal": "weak|moderate|strong",
      "evidence": "Descrição baseada nas respostas fornecidas",
      "concerns": ["Ponto a validar", "Outro ponto"]
    }}
  ],
  "strengths": ["Força identificada", "Outra força"],
  "concerns": ["Ponto de atenção", "Outro ponto"],
  "suggested_interview_questions": ["Pergunta 1", "Pergunta 2"],
  "risk_flags": [
    {{
      "code": "insufficient_evidence|unexpected_pattern",
      "message": "Descrição do risco ou limitação da análise"
    }}
  ]
}}
"""
