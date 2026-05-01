"""Job quality validation service.

Validates job postings to ensure they have sufficient quality for matching.
Scores jobs 0-100 based on completeness and skill configuration.
"""

from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID

import structlog

from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.database.models.job_model import JobModel

logger = structlog.get_logger(__name__)


class JobNotFoundForQualityError(Exception):
    """Job not found when validating quality."""
    pass


@dataclass
class JobQualityResult:
    """Result of job quality validation."""
    quality_score: int                      # 0-100
    status: str                             # "weak" | "acceptable" | "good"
    can_publish: bool
    missing_fields: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class JobQualityValidatorService:
    """Validates job quality for publishing."""

    def __init__(self, repository: SQLAlchemyJobRepository) -> None:
        self._repository = repository

    async def validate(self, job_id: UUID) -> JobQualityResult:
        """Validate job quality.

        Args:
            job_id: UUID of the job to validate

        Returns:
            JobQualityResult with score, status, and recommendations

        Raises:
            JobNotFoundForQualityError: If job not found
        """
        job = await self._repository.find_active_by_id(job_id)
        if job is None:
            raise JobNotFoundForQualityError

        # Fetch required skills
        skill_rows = await self._repository.list_required_skill_rows(job_id)
        skills = [
            {
                "id": row.JobRequiredSkillModel.skill_id,
                "name": row.skill_name,
                "is_mandatory": row.JobRequiredSkillModel.is_mandatory,
                "weight": float(row.JobRequiredSkillModel.weight),
                "minimum_level": row.JobRequiredSkillModel.minimum_level,
                "minimum_years": row.JobRequiredSkillModel.minimum_years,
            }
            for row in skill_rows
        ]

        return self._evaluate(job, skills)

    @staticmethod
    def _evaluate(job: JobModel, skills: list[dict]) -> JobQualityResult:
        """Evaluate job quality based on completeness and configuration.

        Scoring:
        - Title >= 10 chars: 8 pts
        - Description >= 100 chars: 18 pts
        - Requirements >= 50 chars: 10 pts
        - Job area preenchida: 6 pts
        - Responsibilities >= 80 chars: 10 pts
        - Experience context >= 40 chars: 5 pts
        - Behavioral requirements: 3 pts
        - Seniority level filled: 8 pts
        - Minimum years experience: 4 pts
        - Minimum education level: 4 pts
        - >= 2 mandatory skills: 12 pts
        - Mandatory skills with weight >= 0.5: 7 pts
        - < 8 mandatory skills: 5 pts
        - Deal-breakers with reason: 5 pts

        Total nominal: 103 points (score capped at 100)
        """
        score = 0
        missing_fields = []
        suggestions = []
        warnings = []

        # 1. Title quality (10 pts)
        title_length = len(job.title.strip()) if job.title else 0
        if title_length >= 10:
            score += 8
        elif title_length > 0:
            suggestions.append("Título muito curto. Use pelo menos 10 caracteres para melhor contexto.")

        # 2. Description quality (18 pts)
        desc_length = len(job.description.strip()) if job.description else 0
        if desc_length >= 100:
            score += 18
        elif desc_length >= 50:
            score += 9
            suggestions.append("Descrição poderia ser mais detalhada (use >= 100 caracteres).")
        else:
            missing_fields.append("description")
            suggestions.append("Adicione uma descrição clara e detalhada da vaga.")

        # 3. Requirements quality (10 pts)
        req_length = len(job.requirements.strip()) if job.requirements else 0
        if req_length >= 50:
            score += 10
        elif req_length > 0:
            suggestions.append("Requisitos muito breves. Detalhe mais (>= 50 caracteres).")
        else:
            missing_fields.append("requirements")
            suggestions.append("Preencha requisitos técnicos e comportamentais esperados.")

        # 4. Job area (6 pts)
        if job.job_area:
            score += 6
        else:
            missing_fields.append("job_area")
            suggestions.append("Defina a área da vaga para fortalecer o job profile e o matching.")

        # 5. Responsibilities quality (10 pts)
        responsibilities_length = len(job.responsibilities.strip()) if job.responsibilities else 0
        if responsibilities_length >= 80:
            score += 10
        elif responsibilities_length >= 30:
            score += 5
            suggestions.append("Detalhe melhor as responsabilidades principais da vaga.")
        else:
            missing_fields.append("responsibilities")
            suggestions.append("Liste as responsabilidades principais para deixar a vaga mais forte para matching.")

        # 6. Experience context (5 pts)
        experience_context_length = len(job.experience_context.strip()) if job.experience_context else 0
        if experience_context_length >= 40:
            score += 5
        elif experience_context_length > 0:
            score += 2
            suggestions.append("Descreva melhor o contexto de experiência esperado.")
        else:
            missing_fields.append("experience_context")

        # 7. Behavioral requirements (3 pts)
        behavioral_requirements = [item for item in (job.behavioral_requirements or []) if str(item).strip()]
        if behavioral_requirements:
            score += 3
        else:
            warnings.append("Sem requisitos comportamentais estruturados, a vaga fica menos clara para avaliação futura.")

        # 8. Seniority level (8 pts)
        if job.seniority_level:
            score += 8
        else:
            missing_fields.append("seniority_level")
            suggestions.append("Defina o nível de senioridade (estagiário, júnior, pleno, sênior, lead).")

        # 9. Minimum years experience (4 pts)
        if job.minimum_years_experience is not None and job.minimum_years_experience > 0:
            score += 4
        else:
            missing_fields.append("minimum_years_experience")

        # 10. Education level (4 pts)
        if job.minimum_education_level:
            score += 4
        else:
            missing_fields.append("minimum_education_level")

        # 11. Skills validation (24 pts total)
        mandatory_skills = [s for s in skills if s["is_mandatory"]]
        optional_skills = [s for s in skills if not s["is_mandatory"]]
        total_skills = len(skills)

        # Mandatory skills count (12 pts)
        if len(mandatory_skills) >= 2:
            score += 12
        elif len(mandatory_skills) == 1:
            score += 6
            suggestions.append("Considere adicionar mais uma skill obrigatória para melhorar a precisão do matching.")
        else:
            missing_fields.append("mandatory_skills")
            suggestions.append("Adicione pelo menos 2 skills obrigatórias para melhorar o matching.")
            warnings.append("Sem skills obrigatórias, o matching será menos preciso.")

        # Mandatory skills weight (7 pts)
        low_weight_mandatory = [s for s in mandatory_skills if s["weight"] < 0.5]
        if not low_weight_mandatory:
            score += 7
        else:
            skill_names = ", ".join([s["name"] for s in low_weight_mandatory])
            warnings.append(f"Skills obrigatórias com peso baixo: {skill_names}. Aumente o peso para impactar o ranking.")

        # Too many mandatory skills (5 pts penalty, not subtraction)
        if len(mandatory_skills) >= 8:
            warnings.append(f"Muitas skills obrigatórias ({len(mandatory_skills)}). Vagas muito exigentes são mais difíceis de preencher.")
        else:
            score += 5

        # 8. Deal-breakers (5 pts)
        if job.deal_breakers:
            # Check if deal-breakers have reason field
            valid_breakers = [
                db for db in job.deal_breakers
                if isinstance(db, dict) and db.get("reason") and len(str(db.get("reason", "")).strip()) > 0
            ]
            if valid_breakers:
                score += 5
            else:
                suggestions.append("Adicione motivo (reason) aos critérios eliminatórios.")
        else:
            # Optional, but good practice
            pass

        # Determine status and can_publish
        status = "weak" if score < 50 else ("acceptable" if score < 75 else "good")
        can_publish = score >= 50

        # Additional warnings/suggestions based on total skills
        if total_skills > 12:
            suggestions.append("Muitas skills no total. Considere priorizar as mais importantes.")

        return JobQualityResult(
            quality_score=min(100, score),  # Cap at 100
            status=status,
            can_publish=can_publish,
            missing_fields=missing_fields,
            suggestions=suggestions,
            warnings=warnings,
        )
