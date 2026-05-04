from src.application.services.deterministic_scorer import DeterministicScorer


def _base_job() -> dict:
    return {
        "critical_requirements": [{"name": "Python"}, {"name": "SQL"}],
        "desirable_requirements": [{"name": "Power BI"}],
        "minimum_years_experience": 4,
        "target_level": "senior",
        "area": "data",
    }


def _base_candidate() -> dict:
    return {
        "evidenced_skills": [{"name": "Python"}, {"name": "SQL"}, {"name": "Power BI"}],
        "tools": ["Docker"],
        "total_experience_years": 6,
        "seniority_level": "senior",
        "professional_area": "data",
    }


def test_score_high_when_skills_match() -> None:
    scorer = DeterministicScorer()
    result = scorer.calculate(_base_job(), _base_candidate())
    assert result.match_score >= 80


def test_score_low_when_skills_do_not_match() -> None:
    scorer = DeterministicScorer()
    job = _base_job()
    candidate = {
        "evidenced_skills": [{"name": "Excel"}],
        "tools": ["Word"],
        "total_experience_years": 1,
        "seniority_level": "junior",
        "professional_area": "administrative",
    }
    result = scorer.calculate(job, candidate)
    assert result.match_score < 45


def test_recommendation_by_score_range() -> None:
    scorer = DeterministicScorer()
    assert scorer._recommendation(90) == "strong_match"
    assert scorer._recommendation(70) == "interview"
    assert scorer._recommendation(50) == "maybe"
    assert scorer._recommendation(30) == "reject"


def test_gaps_are_correct() -> None:
    scorer = DeterministicScorer()
    job = _base_job()
    candidate = {
        "evidenced_skills": [{"name": "Python"}],
        "tools": [],
    }
    gaps = scorer._gaps(job, candidate)
    assert gaps == ["SQL"]


def test_strengths_are_correct() -> None:
    scorer = DeterministicScorer()
    job = _base_job()
    candidate = {
        "evidenced_skills": [{"name": "Python"}, {"name": "Power BI"}],
        "tools": [],
    }
    strengths = scorer._strengths(job, candidate)
    assert strengths == ["Python"]
