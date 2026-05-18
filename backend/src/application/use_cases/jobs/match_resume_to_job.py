"""
MatchResumeToJobUseCase

Fluxo de matching currículo × vaga:
  1. Busca o resultado de análise (deve estar COMPLETED)
  2. Busca os requisitos da vaga
  3. Monta SkillSet do candidato a partir das analysis_skills
  4. Executa JobCompatibilityCalculator (domínio puro)
  5. Persiste ResumeJobMatch
  6. Retorna resultado detalhado
"""

from decimal import Decimal
from uuid import uuid4

import structlog

from src.application.dtos.analysis_dtos import MatchResumeToJobCommand, MatchResumeToJobResult
from src.domain.entities.analysis import SeniorityLevel
from src.domain.exceptions import NotFoundException, ValidationException
from src.domain.services.job_compatibility_calculator import (
    CompatibilityInput,
    JobCompatibilityCalculator,
)
from src.domain.value_objects.skill_set import RequiredSkill, SkillEntry, SkillSet
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository

logger = structlog.get_logger(__name__)


class MatchResumeToJobUseCase:
    def __init__(
        self,
        analysis_repo: SQLAlchemyAnalysisRepository,
        job_repo: SQLAlchemyJobRepository,
    ) -> None:
        self._analysis_repo = analysis_repo
        self._job_repo = job_repo

    async def execute(self, command: MatchResumeToJobCommand) -> MatchResumeToJobResult:
        # 1. Busca análise completa
        analysis = await self._analysis_repo.find_by_id(command.analysis_id)
        if analysis is None:
            raise NotFoundException("Análise não encontrada")
        if analysis.status.value != "completed":
            raise ValidationException(
                f"Análise não está completa (status atual: {analysis.status.value})"
            )

        result = await self._analysis_repo.find_result(command.analysis_id)
        if result is None:
            raise NotFoundException("Resultado de análise não encontrado")

        # 2. Busca skills extraídas da análise
        analysis_skills = await self._analysis_repo.find_skills(command.analysis_id)

        # 3. Busca vaga e requisitos
        job = await self._job_repo.find_by_id(command.job_id)
        if job is None:
            raise NotFoundException("Vaga não encontrada")

        required_skills = await self._job_repo.find_required_skills(command.job_id)

        # 4. Monta SkillSet do candidato a partir das analysis_skills
        candidate_skill_set = SkillSet.from_list([
            SkillEntry(
                skill_id=s.skill_id,
                skill_name=s.skill_name,
                normalized_name=s.normalized_name,
                proficiency_level=s.proficiency_level,
                years_experience=Decimal(str(s.years_experience)) if s.years_experience else None,
                is_primary=s.is_primary,
                source=s.source,
            )
            for s in analysis_skills
        ])

        # 5. Monta lista de requisitos da vaga
        required_skill_list = [
            RequiredSkill(
                skill_id=rs.skill_id,
                skill_name=rs.skill_name,
                normalized_name=rs.normalized_name,
                is_mandatory=rs.is_mandatory,
                minimum_level=rs.minimum_level,
                minimum_years=Decimal(str(rs.minimum_years)) if rs.minimum_years else None,
                weight=Decimal(str(rs.weight)),
            )
            for rs in required_skills
        ]

        # 6. Executa o calculador de compatibilidade (domínio puro)
        calculator = JobCompatibilityCalculator()
        compatibility = calculator.calculate(
            CompatibilityInput(
                candidate_skills=candidate_skill_set,
                required_skills=required_skill_list,
                candidate_seniority=SeniorityLevel(result.seniority_level or "junior"),
                candidate_experience_years=float(result.total_experience_years or 0),
                candidate_education_level=result.highest_education_level or "none",
                job_seniority=SeniorityLevel(job.seniority_level) if job.seniority_level else None,
                job_min_experience_years=None,   # TODO: buscar do job metadata
                job_min_education_level=None,
            )
        )

        # 7. Persiste o match
        match_id = await self._analysis_repo.save_job_match(
            analysis_id=command.analysis_id,
            job_id=command.job_id,
            compatibility=compatibility,
        )

        logger.info(
            "analysis.job_match_created",
            match_id=str(match_id),
            analysis_id=str(command.analysis_id),
            job_id=str(command.job_id),
            score=float(compatibility.match_score.value),
            recommendation=compatibility.recommendation,
        )

        return MatchResumeToJobResult(
            match_id=match_id,
            analysis_id=command.analysis_id,
            job_id=command.job_id,
            match_score=compatibility.match_score.value,
            recommendation=compatibility.recommendation,
            matched_skills=compatibility.matched_skills,
            missing_mandatory_skills=compatibility.missing_mandatory_skills,
            missing_optional_skills=compatibility.missing_optional_skills,
            bonus_skills=compatibility.bonus_skills,
            match_summary=compatibility.match_summary,
            score_breakdown={
                "mandatory_skills": float(compatibility.mandatory_skills_score.value),
                "optional_skills": float(compatibility.optional_skills_score.value),
                "seniority": float(compatibility.seniority_score.value),
                "experience": float(compatibility.experience_score.value),
                "education": float(compatibility.education_score.value),
                "mandatory_coverage_pct": compatibility.mandatory_skills_coverage,
            },
        )
