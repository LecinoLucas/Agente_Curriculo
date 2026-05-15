"""
Testes de ResumeProfilerService.

Verifica que:
  - Perfis de candidato são gerados a partir de currículos
  - Cache funciona corretamente (hit/miss/invalidação)
  - Diferentes níveis de senioridade são detectados
  - Diferentes áreas profissionais são identificadas
  - Falhas de IA não quebram geração
  - Evidências são extraídas corretamente
  - Serialização round-trip funciona
  - Completeness é calculado apropriadamente
"""

import json
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.application.services.resume_profiler_service import (
    InMemoryCandidateProfileCache,
    ResumeProfilerService,
)
from src.domain.value_objects.candidate_profile import CandidateProfile


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_ai_service():
    return AsyncMock()


@pytest.fixture
def cache():
    return InMemoryCandidateProfileCache()


@pytest.fixture
def resume_profiler_service(mock_ai_service, cache):
    return ResumeProfilerService(ai_service=mock_ai_service, cache=cache)


def _mock_ai_response(
    detected_level="mid",
    experience_years=3.0,
    area="technology",
    completeness=0.75,
    confidence="high",
    num_skills=3,
):
    """Helper para criar uma resposta IA mockada padrão."""
    return {
        "detected_level": detected_level,
        "estimated_experience_years": experience_years,
        "current_role": "Software Engineer",
        "professional_area": area,
        "experiences": [
            {
                "company": "TechCorp",
                "role": "Python Developer",
                "duration_months": 24,
                "is_current": True,
                "is_leadership": False,
                "key_activities": ["Developed backend services", "Code reviews"],
                "technologies_used": ["Python", "FastAPI", "PostgreSQL"],
            }
        ],
        "evidenced_skills": [
            {
                "name": f"Skill {i}",
                "evidence_text": f"Evidence for skill {i}",
                "confidence": "high",
                "years_evidenced": 2.0,
                "source": "experience",
            }
            for i in range(num_skills)
        ],
        "tools_and_systems": ["Python", "FastAPI", "PostgreSQL"],
        "capabilities": [
            {
                "name": "Problem Solving",
                "evidence_text": "Resolved complex architectural issues",
                "strength": "high",
                "source": "experience",
                "confidence": "high",
            }
        ],
        "education": [
            {
                "level": "bachelor",
                "field": "Computer Science",
                "institution": "University of Tech",
                "graduation_year": 2020,
                "is_completed": True,
            }
        ],
        "certifications": [
            {
                "name": "AWS Solutions Architect",
                "issuer": "Amazon",
                "obtained_date": "2021-06",
                "is_active": True,
            }
        ],
        "leadership_evidence": [],
        "business_impact_evidence": ["Improved API performance by 40%"],
        "profile_completeness": completeness,
        "confidence": confidence,
    }


# ---------------------------------------------------------------------------
# Cenário 1 — Gerar perfil de currículo simples
# ---------------------------------------------------------------------------


async def test_generate_profile_from_valid_resume(mock_ai_service, resume_profiler_service):
    """Gera CandidateProfile a partir de um currículo válido."""
    resume_text = """
    John Doe
    Python Developer with 3 years of experience

    Experience:
    TechCorp (2021-present): Python Developer
    - Developed backend services
    - Code reviews

    Skills: Python, FastAPI, PostgreSQL

    Education: BS Computer Science, University of Tech (2020)
    Certifications: AWS Solutions Architect (2021)
    """

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response())
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile is not None
    assert isinstance(profile, CandidateProfile)
    assert profile.detected_level == "mid"
    assert profile.estimated_experience_years == 3.0
    assert profile.current_role == "Software Engineer"
    assert profile.professional_area == "technology"
    assert len(profile.evidenced_skills) == 3
    assert len(profile.experiences) == 1
    mock_ai_service.analyze.assert_called_once()


# ---------------------------------------------------------------------------
# Cenário 2 — Cache hit e miss
# ---------------------------------------------------------------------------


async def test_cache_miss_calls_ai(mock_ai_service, resume_profiler_service):
    """Primeira chamada com mesmo currículo chama IA."""
    resume_text = "Python Developer with 5 years experience"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(experience_years=5.0))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile1 = await resume_profiler_service.generate_profile(resume_text)

    assert mock_ai_service.analyze.call_count == 1
    assert profile1.estimated_experience_years == 5.0


async def test_cache_hit_skips_ai(mock_ai_service, resume_profiler_service):
    """Segunda chamada com mesmo currículo usa cache."""
    resume_text = "Python Developer with 5 years experience"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(experience_years=5.0))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile1 = await resume_profiler_service.generate_profile(resume_text)
    assert mock_ai_service.analyze.call_count == 1

    profile2 = await resume_profiler_service.generate_profile(resume_text)
    assert mock_ai_service.analyze.call_count == 1  # Não foi chamado novamente

    assert profile1.resume_hash == profile2.resume_hash
    assert profile1.estimated_experience_years == profile2.estimated_experience_years


async def test_different_resumes_call_ai_twice(mock_ai_service, resume_profiler_service):
    """Currículos diferentes geram cache misses separados."""
    resume1 = "Developer with 3 years"
    resume2 = "Data Engineer with 5 years"

    def make_response(years):
        resp = AsyncMock()
        resp.content = json.dumps(_mock_ai_response(experience_years=years))
        resp.input_tokens = 100
        resp.output_tokens = 500
        resp.cache_read_tokens = 0
        return resp

    mock_ai_service.analyze.side_effect = [make_response(3.0), make_response(5.0)]

    profile1 = await resume_profiler_service.generate_profile(resume1)
    profile2 = await resume_profiler_service.generate_profile(resume2)

    assert mock_ai_service.analyze.call_count == 2
    assert profile1.estimated_experience_years == 3.0
    assert profile2.estimated_experience_years == 5.0
    assert profile1.resume_hash != profile2.resume_hash


# ---------------------------------------------------------------------------
# Cenário 3 — Diferentes níveis de senioridade
# ---------------------------------------------------------------------------


async def test_junior_level_detection(mock_ai_service, resume_profiler_service):
    """Detecta nível junior corretamente."""
    resume_text = "Fresh graduate, 6 months as Junior Developer"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(detected_level="junior", experience_years=0.5))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.detected_level == "junior"
    assert profile.estimated_experience_years == 0.5


async def test_senior_level_detection(mock_ai_service, resume_profiler_service):
    """Detecta nível senior corretamente."""
    resume_text = "Senior Backend Engineer with 7 years of experience"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(detected_level="senior", experience_years=7.0))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.detected_level == "senior"
    assert profile.estimated_experience_years == 7.0


async def test_lead_level_with_leadership_evidence(mock_ai_service, resume_profiler_service):
    """Detecta nível lead com evidências de liderança."""
    resume_text = "Engineering Manager leading a team of 5 engineers"

    response_data = _mock_ai_response(
        detected_level="lead",
        experience_years=8.0,
    )
    response_data["leadership_evidence"] = [
        "Managed team of 5 engineers",
        "Mentored 3 junior developers",
    ]

    mock_response = AsyncMock()
    mock_response.content = json.dumps(response_data)
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.detected_level == "lead"
    assert profile.has_leadership is True
    assert len(profile.leadership_evidence) == 2


# ---------------------------------------------------------------------------
# Cenário 4 — Diferentes áreas profissionais
# ---------------------------------------------------------------------------


async def test_technology_area_detection(mock_ai_service, resume_profiler_service):
    """Detecta área de tecnologia."""
    resume_text = "Software Engineer specializing in backend development"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(area="technology"))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.professional_area == "technology"


async def test_data_area_detection(mock_ai_service, resume_profiler_service):
    """Detecta área de dados."""
    resume_text = "Data Engineer with expertise in ETL pipelines and Python"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(area="data"))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.professional_area == "data"


async def test_financial_area_detection(mock_ai_service, resume_profiler_service):
    """Detecta área financeira."""
    resume_text = "Financial Analyst with FP&A and budgeting experience"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(area="financial"))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.professional_area == "financial"


# ---------------------------------------------------------------------------
# Cenário 5 — Extração de evidências
# ---------------------------------------------------------------------------


async def test_skills_extraction(mock_ai_service, resume_profiler_service):
    """Extrai skills com confiança e evidências."""
    resume_text = "Python expert with 5 years experience in web development"

    response_data = _mock_ai_response()
    response_data["evidenced_skills"] = [
        {
            "name": "Backend Development with Python",
            "evidence_text": "5 years building scalable Python applications",
            "confidence": "very_high",
            "years_evidenced": 5.0,
            "source": "experience",
        },
        {
            "name": "FastAPI Framework",
            "evidence_text": "Built 3 microservices using FastAPI",
            "confidence": "high",
            "years_evidenced": 2.0,
            "source": "experience",
        },
    ]

    mock_response = AsyncMock()
    mock_response.content = json.dumps(response_data)
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.total_skills_evidenced == 2
    assert profile.evidenced_skills[0].name == "Backend Development with Python"
    assert profile.evidenced_skills[0].confidence == "very_high"
    assert profile.evidenced_skills[1].years_evidenced == 2.0


async def test_experience_extraction(mock_ai_service, resume_profiler_service):
    """Extrai experiências com detalhes."""
    resume_text = "10+ years in tech leadership and development"

    response_data = _mock_ai_response()
    response_data["experiences"] = [
        {
            "company": "BigTech Inc",
            "role": "Senior Engineer",
            "duration_months": 36,
            "is_current": True,
            "is_leadership": False,
            "key_activities": ["Led API redesign", "Mentored 2 junior devs"],
            "technologies_used": ["Python", "Kubernetes", "PostgreSQL"],
        },
        {
            "company": "StartupCorp",
            "role": "Engineering Lead",
            "duration_months": 24,
            "is_current": False,
            "is_leadership": True,
            "key_activities": ["Built platform from scratch", "Managed team"],
            "technologies_used": ["Node.js", "MongoDB"],
        },
    ]

    mock_response = AsyncMock()
    mock_response.content = json.dumps(response_data)
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.total_experiences == 2
    assert profile.experiences[0].company == "BigTech Inc"
    assert profile.experiences[0].is_current is True
    assert profile.experiences[1].is_leadership is True


async def test_education_extraction(mock_ai_service, resume_profiler_service):
    """Extrai educação formal."""
    resume_text = "MS Computer Science graduate"

    response_data = _mock_ai_response()
    response_data["education"] = [
        {
            "level": "master",
            "field": "Computer Science",
            "institution": "MIT",
            "graduation_year": 2018,
            "is_completed": True,
        },
        {
            "level": "bachelor",
            "field": "Computer Engineering",
            "institution": "Carnegie Mellon",
            "graduation_year": 2016,
            "is_completed": True,
        },
    ]

    mock_response = AsyncMock()
    mock_response.content = json.dumps(response_data)
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert len(profile.education) == 2
    assert profile.education[0].level == "master"
    assert profile.education[1].level == "bachelor"


async def test_certifications_extraction(mock_ai_service, resume_profiler_service):
    """Extrai certificações."""
    resume_text = "AWS and GCP certified professional"

    response_data = _mock_ai_response()
    response_data["certifications"] = [
        {
            "name": "AWS Solutions Architect Associate",
            "issuer": "Amazon",
            "obtained_date": "2022-03",
            "is_active": True,
        },
        {
            "name": "Google Cloud Professional Data Engineer",
            "issuer": "Google",
            "obtained_date": "2021-09",
            "is_active": True,
        },
    ]

    mock_response = AsyncMock()
    mock_response.content = json.dumps(response_data)
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert len(profile.certifications) == 2
    assert profile.certifications[0].name == "AWS Solutions Architect Associate"
    assert profile.certifications[1].is_active is True


# ---------------------------------------------------------------------------
# Cenário 6 — Impacto nos negócios
# ---------------------------------------------------------------------------


async def test_business_impact_extraction(mock_ai_service, resume_profiler_service):
    """Extrai evidências de impacto nos negócios."""
    resume_text = "Increased revenue by 35% and reduced costs by $500k"

    response_data = _mock_ai_response()
    response_data["business_impact_evidence"] = [
        "Increased revenue by 35% through optimization",
        "Reduced operational costs by $500k annually",
        "Shipped 3 major features on schedule",
    ]

    mock_response = AsyncMock()
    mock_response.content = json.dumps(response_data)
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert len(profile.business_impact_evidence) == 3
    assert "35%" in profile.business_impact_evidence[0]
    assert "$500k" in profile.business_impact_evidence[1]


# ---------------------------------------------------------------------------
# Cenário 7 — Completeness scoring
# ---------------------------------------------------------------------------


async def test_high_completeness_score(mock_ai_service, resume_profiler_service):
    """Currículo bem estruturado recebe score alto."""
    resume_text = "Detailed resume with all sections"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(completeness=0.95))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.profile_completeness == 0.95
    assert profile.is_well_described is True


async def test_low_completeness_score(mock_ai_service, resume_profiler_service):
    """Currículo incompleto recebe score baixo."""
    resume_text = "Name: John"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response(completeness=0.2))
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile.profile_completeness == 0.2
    assert profile.is_well_described is False


# ---------------------------------------------------------------------------
# Cenário 8 — Erro de IA com fallback
# ---------------------------------------------------------------------------


async def test_ai_failure_returns_fallback_profile(mock_ai_service, resume_profiler_service):
    """Se IA falha, retorna perfil de fallback."""
    resume_text = "Some resume text"

    mock_ai_service.analyze.side_effect = RuntimeError("API timeout")

    profile = await resume_profiler_service.generate_profile(resume_text)

    assert profile is not None
    assert isinstance(profile, CandidateProfile)
    assert profile.detected_level == "undefined"
    assert profile.confidence == "low"
    assert profile.profile_completeness == 0.0
    assert len(profile.experiences) == 0
    assert len(profile.evidenced_skills) == 0


async def test_empty_resume_returns_fallback(mock_ai_service, resume_profiler_service):
    """Currículo vazio retorna fallback sem chamar IA."""
    profile = await resume_profiler_service.generate_profile("")

    assert profile.confidence == "low"
    assert profile.detected_level == "undefined"
    assert not mock_ai_service.analyze.called


async def test_whitespace_only_resume_returns_fallback(mock_ai_service, resume_profiler_service):
    """Currículo com apenas espaços retorna fallback."""
    profile = await resume_profiler_service.generate_profile("   \n\t  ")

    assert profile.confidence == "low"
    assert not mock_ai_service.analyze.called


# ---------------------------------------------------------------------------
# Cenário 9 — Serialização
# ---------------------------------------------------------------------------


async def test_profile_to_dict_serialization(mock_ai_service, resume_profiler_service):
    """CandidateProfile serializa para dict corretamente."""
    resume_text = "Developer resume"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response())
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile = await resume_profiler_service.generate_profile(resume_text)
    profile_dict = profile.to_dict()

    assert isinstance(profile_dict, dict)
    assert profile_dict["detected_level"] == "mid"
    assert profile_dict["estimated_experience_years"] == 3.0
    assert profile_dict["professional_area"] == "technology"
    assert "experiences" in profile_dict
    assert "evidenced_skills" in profile_dict


async def test_profile_from_dict_deserialization(mock_ai_service, resume_profiler_service):
    """CandidateProfile deserializa de dict corretamente."""
    resume_text = "Developer resume"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response())
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile1 = await resume_profiler_service.generate_profile(resume_text)
    profile_dict = profile1.to_dict()

    profile2 = CandidateProfile.from_dict(profile_dict)

    assert profile2.detected_level == profile1.detected_level
    assert profile2.estimated_experience_years == profile1.estimated_experience_years
    assert profile2.professional_area == profile1.professional_area
    assert len(profile2.experiences) == len(profile1.experiences)


async def test_round_trip_serialization(mock_ai_service, resume_profiler_service):
    """Serialização e desserialização mantêm integridade dos dados."""
    resume_text = "Complex resume with many details"

    response_data = _mock_ai_response(
        detected_level="senior",
        experience_years=7.0,
        area="data",
        completeness=0.88,
    )
    response_data["evidenced_skills"] = [
        {
            "name": "Data Pipeline Engineering",
            "evidence_text": "Built ETL pipelines processing 10TB daily",
            "confidence": "very_high",
            "years_evidenced": 6.0,
            "source": "experience",
        }
    ]
    response_data["business_impact_evidence"] = ["Reduced query time by 50%"]

    mock_response = AsyncMock()
    mock_response.content = json.dumps(response_data)
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    original = await resume_profiler_service.generate_profile(resume_text)
    restored = CandidateProfile.from_dict(original.to_dict())

    assert restored.detected_level == original.detected_level
    assert restored.estimated_experience_years == original.estimated_experience_years
    assert restored.professional_area == original.professional_area
    assert restored.profile_completeness == original.profile_completeness
    assert len(restored.evidenced_skills) == len(original.evidenced_skills)
    assert len(restored.business_impact_evidence) == len(original.business_impact_evidence)


# ---------------------------------------------------------------------------
# Cenário 10 — Cache invalidation
# ---------------------------------------------------------------------------


async def test_cache_invalidation(mock_ai_service, resume_profiler_service):
    """Cache pode ser invalidado manualmente."""
    resume_text = "Developer with Python"

    mock_response = AsyncMock()
    mock_response.content = json.dumps(_mock_ai_response())
    mock_response.input_tokens = 100
    mock_response.output_tokens = 500
    mock_response.cache_read_tokens = 0

    mock_ai_service.analyze.return_value = mock_response

    profile1 = await resume_profiler_service.generate_profile(resume_text)
    assert mock_ai_service.analyze.call_count == 1

    resume_profiler_service.invalidate(resume_text)

    profile2 = await resume_profiler_service.generate_profile(resume_text)
    assert mock_ai_service.analyze.call_count == 2

    assert profile1.resume_hash == profile2.resume_hash
