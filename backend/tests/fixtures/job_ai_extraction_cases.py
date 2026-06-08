"""
Fixtures and test cases for Job AI Extraction Validation (Phase JOB-AI-EXTRACTION-VALIDATION-1)
Contains 5 mandatory test scenarios comparing:
1. Original text input
2. AI mock response (purposely flawed/omitted)
3. Expected finalized draft after parsing and backfilling
"""
from typing import Any, Dict, List, Optional

class ExtractionTestCase:
    def __init__(
        self,
        name: str,
        input_text: str,
        mock_ai_json: Dict[str, Any],
        expected_draft: Dict[str, Any],
        expected_warnings_contain: List[str] = [],
        expected_needs_review_contain: List[str] = [],
        expected_safety_severity: Optional[str] = None
    ):
        self.name = name
        self.input_text = input_text
        self.mock_ai_json = mock_ai_json
        self.expected_draft = expected_draft
        self.expected_warnings_contain = expected_warnings_contain
        self.expected_needs_review_contain = expected_needs_review_contain
        self.expected_safety_severity = expected_safety_severity

# 1. Assistente Administrativo sem salário/benefícios
# AI mock purposedly omits experience_context and invents a salary/benefits and work_model.
CASE_1 = ExtractionTestCase(
    name="Assistente Administrativo sem salario/beneficios",
    input_text=(
        "Criar vaga para Assistente Administrativo.\n"
        "Vai ajudar com lançamentos, conferência de documentos, atendimento interno, planilhas e organização de arquivos.\n"
        "Precisa ter conhecimento em Excel, boa comunicação e organização.\n"
        "Escala 6x1, 44 horas semanais, 3 vagas disponíveis.\n"
        "Preferência por pessoa jovem, boa aparência e que more perto da empresa.\n"
        "Não informar salário.\n"
        "Não informar benefícios."
    ),
    mock_ai_json={
        "title": "Assistente Administrativo",
        "area": "Administrativa",
        "work_model": "onsite", # AI invented
        "unit": "Perto da empresa", # AI invented from "more perto"
        "salary_min": 1500, # AI invented
        "salary_max": 2000, # AI invented
        "benefits": ["Vale transporte"], # AI invented
        "working_hours": "Escala 6x1, 44 horas semanais",
        "minimum_years_experience": None,
        "minimum_education_level": None,
        "experience_context": None, # AI omitted
        "responsibilities": ["lançamentos", "conferência", "atendimento", "planilhas", "arquivos"],
        "requirements": ["pessoa jovem", "boa aparência", "Excel", "boa comunicação", "organização"],
        "mandatory_skills": ["Excel", "boa comunicação", "organização"],
        "nice_to_have_skills": [],
        "screening_questions": [],
        "pipeline_steps": [],
        "matching_criteria": [],
        "selection_flow_type": None,
        "requires_manager_review": False,
        "requires_behavioral_assessment": False
    },
    expected_draft={
        "title": "Assistente Administrativo",
        "area": "Administrativa",
        "work_model": None, # Should be removed (no evidence)
        "unit": None, # Should be removed (no explicit evidence)
        "salary_min": None, # Removed
        "salary_max": None, # Removed
        "benefits": [], # Removed
        "working_hours": "Escala 6x1, 44 horas semanais",
        "minimum_years_experience": None,
        "minimum_education_level": None,
        "experience_context": "rotinas administrativas", # Should be backfilled
        "responsibilities": ["lançamentos", "conferência", "atendimento", "planilhas", "arquivos"],
        # Discriminatory terms should be removed
        "requirements": ["Excel", "boa comunicação", "organização"]
    },
    expected_warnings_contain=["salary_removed_no_source_evidence", "discriminatory_requirement_removed"],
    expected_needs_review_contain=["safety_check", "salary_range", "unit", "work_model"],
    expected_safety_severity="high" # "pessoa jovem", "boa aparência"
)

# 2. Vaga Protheus com salário explícito
# AI mock tries to invent behavioral_assessment and adds extra requirements
CASE_2 = ExtractionTestCase(
    name="Vaga Protheus com salario explicito",
    input_text=(
        "Criar vaga para Analista de Suporte Protheus N2.\n"
        "Atuação presencial em Goiânia.\n"
        "Experiência mínima de 2 anos com Protheus.\n"
        "Ensino médio completo.\n"
        "Conhecimento em SQL, financeiro, fiscal, CNAB e conciliação.\n"
        "Salário R$ 3.000 por mês.\n"
        "Benefícios: vale transporte e vale alimentação.\n"
        "Processo com entrevista com RH e gestor técnico."
    ),
    mock_ai_json={
        "title": "Analista de Suporte Protheus N2",
        "area": "TI",
        "work_model": "onsite",
        "unit": "Goiânia",
        "salary_min": 3000,
        "salary_max": 3000,
        "benefits": ["Vale transporte", "Vale alimentação", "Plano de saúde"], # Health plan invented
        "working_hours": None,
        "minimum_years_experience": 2,
        "minimum_education_level": "Ensino médio completo",
        "experience_context": "Protheus",
        "responsibilities": ["Suporte N2", "Conciliação"],
        "requirements": ["SQL", "financeiro", "fiscal", "CNAB", "conciliação"],
        "mandatory_skills": ["SQL", "Protheus"],
        "nice_to_have_skills": [],
        "screening_questions": [],
        "pipeline_steps": [],
        "matching_criteria": [],
        "selection_flow_type": None,
        "requires_manager_review": True,
        "requires_behavioral_assessment": True # Invented
    },
    expected_draft={
        "title": "Analista de Suporte Protheus N2",
        "work_model": "onsite",
        "unit": "Goiânia",
        "salary_min": 3000,
        "salary_max": 3000,
        "benefits": ["Vale transporte", "Vale alimentação"], # Health plan removed
        "minimum_years_experience": 2,
        "minimum_education_level": "Ensino médio completo",
        "requires_manager_review": True,
        "requires_behavioral_assessment": False
    },
    expected_warnings_contain=["benefit_removed"],
    expected_needs_review_contain=["working_hours"],
    expected_safety_severity=None
)

# 3. Vaga com números que não são salário
# AI mock shouldn't invent salary but what if it does?
CASE_3 = ExtractionTestCase(
    name="Vaga com numeros que nao sao salario",
    input_text=(
        "Criar vaga para Auxiliar Operacional.\n"
        "Escala 6x1, 44 horas semanais, 3 vagas.\n"
        "Necessário organização, atenção e disponibilidade para turnos.\n"
        "Não informar salário e benefícios."
    ),
    mock_ai_json={
        "title": "Auxiliar Operacional",
        "area": "Operacional",
        "work_model": None,
        "unit": None,
        "salary_min": 44, # AI misinterprets 44 hours as salary
        "salary_max": 61, # AI misinterprets 6x1
        "benefits": [],
        "working_hours": "Escala 6x1, 44 horas semanais",
        "minimum_years_experience": 3, # AI misinterprets 3 vagas as 3 years
        "minimum_education_level": None,
        "experience_context": None,
        "responsibilities": [],
        "requirements": ["organização", "atenção", "disponibilidade para turnos"],
        "mandatory_skills": ["organização"],
        "nice_to_have_skills": [],
        "screening_questions": [],
        "pipeline_steps": [],
        "matching_criteria": [],
        "selection_flow_type": None,
        "requires_manager_review": False,
        "requires_behavioral_assessment": False
    },
    expected_draft={
        "title": "Auxiliar Operacional",
        "salary_min": None,
        "salary_max": None,
        "benefits": [],
        "working_hours": "Escala 6x1, 44 horas semanais",
        "minimum_years_experience": None, # Removed because it's invented from openings count
        "requirements": ["organização", "atenção", "disponibilidade para turnos"]
    },
    expected_warnings_contain=["salary_removed_no_source_evidence", "years_experience_removed_no_source_evidence"],
    expected_needs_review_contain=["salary_range", "work_model", "unit"],
    expected_safety_severity=None
)

# 4. Vaga com escolaridade e experiência explícitas
# AI mock forgets requirements
CASE_4 = ExtractionTestCase(
    name="Vaga com escolaridade e experiencia explicitas",
    input_text=(
        "Vaga para Assistente Financeiro.\n"
        "Exige ensino superior cursando ou completo em Administração, Contabilidade ou áreas correlatas.\n"
        "Experiência mínima de 1 ano em contas a pagar, contas a receber e conciliação bancária.\n"
        "Conhecimento em Excel."
    ),
    mock_ai_json={
        "title": "Assistente Financeiro",
        "area": "Financeiro",
        "work_model": None,
        "unit": None,
        "salary_min": None,
        "salary_max": None,
        "benefits": [],
        "working_hours": None,
        "minimum_years_experience": 1,
        "minimum_education_level": "Ensino superior cursando ou completo em Administração, Contabilidade",
        "experience_context": "contas a pagar, contas a receber e conciliação bancária",
        "responsibilities": [],
        "requirements": [], # AI omitted Excel and education from requirements list
        "mandatory_skills": ["Excel"],
        "nice_to_have_skills": [],
        "screening_questions": [],
        "pipeline_steps": [],
        "matching_criteria": [],
        "selection_flow_type": None,
        "requires_manager_review": False,
        "requires_behavioral_assessment": False
    },
    expected_draft={
        "title": "Assistente Financeiro",
        "minimum_years_experience": 1,
        "minimum_education_level": "Ensino superior cursando ou completo em Administração, Contabilidade",
        "experience_context": "contas a pagar, contas a receber e conciliação bancária",
        "salary_min": None,
        "benefits": []
        # Requirements should be backfilled with education and skills if empty? 
        # Actually our rule backfills from AI if needed, we'll see how it reacts.
    },
    expected_warnings_contain=[],
    expected_needs_review_contain=["salary_range", "work_model", "unit", "working_hours"],
    expected_safety_severity=None
)

# 5. Texto discriminatório forte
# AI returns it raw
CASE_5 = ExtractionTestCase(
    name="Texto discriminatorio forte",
    input_text=(
        "Vaga para jovem atendente, perfil feminino, boa aparência, sem filhos e até 30 anos."
    ),
    mock_ai_json={
        "title": "Jovem atendente feminino",
        "description": "Vaga para jovem atendente, perfil feminino, boa aparência, sem filhos e até 30 anos.",
        "area": "Atendimento",
        "work_model": None,
        "unit": None,
        "salary_min": None,
        "salary_max": None,
        "benefits": [],
        "working_hours": None,
        "minimum_years_experience": None,
        "minimum_education_level": None,
        "experience_context": None,
        "responsibilities": [],
        "requirements": ["perfil feminino", "boa aparência", "sem filhos", "até 30 anos"],
        "mandatory_skills": [],
        "nice_to_have_skills": [],
        "screening_questions": [],
        "pipeline_steps": [],
        "matching_criteria": [],
        "selection_flow_type": None,
        "requires_manager_review": False,
        "requires_behavioral_assessment": False
    },
    expected_draft={
        "title": None, # Title should be stripped/flagged
        "description": None, # Description stripped
        "requirements": [], # Discriminatory items removed
    },
    expected_warnings_contain=["discriminatory_requirement_removed"],
    expected_needs_review_contain=["safety_check"],
    expected_safety_severity="high"
)

EXTRACTION_CASES = [CASE_1, CASE_2, CASE_3, CASE_4, CASE_5]
