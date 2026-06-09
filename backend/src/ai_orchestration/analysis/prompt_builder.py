PROMPT_INSTRUCTION = (
    "Analise o candidato e retorne JSON válido. Avalie somente critérios "
    "profissionais objetivos relacionados à vaga: experiência, skills, formação "
    "quando exigida, certificações, histórico de funções e requisitos declarados. "
    "Ignore dados sensíveis/protegidos e nunca use idade, data de nascimento, "
    "gênero, raça/cor/etnia, religião, estado civil, filhos/família, gravidez, "
    "saúde, deficiência, aparência/foto, endereço/bairro/distância, nacionalidade "
    "ou orientação sexual como critério. Se esses dados aparecerem no currículo, "
    "não os mencione em resumo, pontos fortes, lacunas, recomendações ou qualquer "
    "justificativa. Diferencie informação não informada de ausência comprovada e "
    "não reprove automaticamente por dado ausente."
)


def build_minimal_user_prompt(*, resume_text: str, job_context: str) -> str:
    # IMPORTANT: this prompt must request ``experiences`` and ``education`` so
    # the parser can derive ``total_experience_months`` / ``highest_education_level``.
    # Without those fields, every candidate lands on a fixed (50, 60) education/
    # confidence pair regardless of resume content — the very regression this
    # exists to prevent. Do not remove these fields without updating
    # ``response_parser._normalize_resume_profiler_v2`` accordingly.
    return (
        "INSTRUÇÃO:\n"
        f"{PROMPT_INSTRUCTION}\n\n"
        "Responda começando diretamente com '{'.\n"
        "Sem blocos de código. Sem explicação. Sem campos extras.\n"
        "Use JSON minificado quando possível.\n\n"
        "DADOS:\n"
        "CURRICULO_RESUMIDO:\n"
        f"{resume_text}\n\n"
        "VAGA_RESUMIDA:\n"
        f"{job_context or 'sem contexto de vaga'}\n\n"
        "SAÍDA:\n"
        "Apenas JSON puro e compacto.\n"
        "Retorne EXATAMENTE estes campos (não invente dados; use null/[] quando ausente):\n"
        "{\n"
        '  "professional_area": "technology|data|administrative|accounting|financial|'
        'commercial|operational|leadership|other",\n'
        '  "seniority_level": "intern|junior|mid|senior|lead|undefined",\n'
        '  "skills": ["maximo 4 skills curtas e normalizadas"],\n'
        '  "experiences": [{"role": "string", "duration_months": "integer >= 0"}],\n'
        '  "education": [{"level": "none|high_school|technical|bachelor|postgraduate|'
        'master|phd", "field": "string|null"}],\n'
        '  "total_experience_months": "integer >= 0"\n'
        "}"
    )
