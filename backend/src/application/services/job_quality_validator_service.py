"""Job quality validation service.

Validates job postings to ensure they have sufficient quality for matching.
Scores jobs 0-100 based on completeness and skill configuration.
"""

from dataclasses import dataclass, field
import re
from uuid import UUID

import structlog

from src.application.services.job_skill_priority_service import (
    is_complementary_skill,
    is_eliminatory_skill,
    is_priority_skill,
)
from src.application.services.skill_requirements_service import (
    validate_skill_requirements,
    validate_skill_requirements_product_rules,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.database.models.job_model import JobModel

logger = structlog.get_logger(__name__)

_FULL_STACK_PATTERN = re.compile(r"\bfull[\s-]?stack\b", re.IGNORECASE)
_TECHNICAL_ROLE_PATTERN = re.compile(
    r"\b(developer|desenvolvedor|engineer|engenheiro|software|backend|frontend|full[\s-]?stack|data|devops|qa|mobile|platform|infra|cloud|security|api)\b",
    re.IGNORECASE,
)
_FRONTEND_SKILL_HINTS = (
    "frontend",
    "react",
    "vue",
    "angular",
)
_BACKEND_SKILL_HINTS = (
    "backend",
    "node",
    "java",
    "python",
    "api",
)


class JobNotFoundForQualityError(Exception):
    """Job not found when validating quality."""
    pass


@dataclass
class JobQualityResult:
    """Result of job quality validation."""
    quality_score: int                      # 0-100
    status: str                             # "weak" | "acceptable" | "good"
    can_publish: bool
    publication_blockers: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    validation_errors: list[str] = field(default_factory=list)


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
                "priority_level": row.JobRequiredSkillModel.priority_level,
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
        - >= 2 skills essenciais: 12 pts
        - Skills essenciais com weight >= 0.5: 7 pts
        - <= 5 skills essenciais: 5 pts
        - Deal-breakers with reason: 5 pts

        Total nominal: 103 points (score capped at 100)
        """
        score = 0
        missing_fields = []
        suggestions = []
        warnings = []
        validation_errors: list[str] = []

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
        priority_skills = [s for s in skills if is_priority_skill(s["priority_level"])]
        complementary_skills = [s for s in skills if is_complementary_skill(s["priority_level"])]
        eliminatory_skills = [s for s in skills if is_eliminatory_skill(s["priority_level"])]
        total_skills = len(skills)
        effective_skill_requirements = JobQualityValidatorService._resolve_effective_skill_requirements(
            job,
            skills,
            warnings,
        )
        skill_requirements_validation = validate_skill_requirements_product_rules(
            effective_skill_requirements,
            job_area=job.job_area,
            check_raw_duplicates=False,
        )

        # Essential skills count (12 pts)
        if len(priority_skills) >= 2:
            score += 12
        elif len(priority_skills) == 1:
            score += 6
            suggestions.append("Considere adicionar mais uma skill essencial para melhorar a precisão do matching.")
        else:
            missing_fields.append("priority_skills")
            suggestions.append("Adicione pelo menos 2 skills essenciais para melhorar o matching.")
            warnings.append("Sem skills essenciais, o matching será menos preciso.")

        # Essential skills weight (7 pts)
        low_weight_priority = [s for s in priority_skills if s["weight"] < 0.5]
        if not low_weight_priority:
            score += 7
        else:
            skill_names = ", ".join([s["name"] for s in low_weight_priority])
            warnings.append(f"Skills essenciais com peso baixo: {skill_names}. Aumente o peso para impactar o ranking.")

        if len(priority_skills) > 5:
            warnings.append(
                "Muitas skills essenciais podem deixar o ranking restritivo. Considere mover algumas para diferenciais."
            )
        else:
            score += 5

        if complementary_skills:
            score += 2
        if eliminatory_skills:
            score += 2

        JobQualityValidatorService._append_skill_configuration_alerts(
            job=job,
            priority_skills=priority_skills,
            complementary_skills=complementary_skills,
            warnings=warnings,
        )

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

        publication_blockers: list[str] = []
        if not job.job_area:
            publication_blockers.append("job_area")
        if not job.seniority_level:
            publication_blockers.append("seniority_level")
        if job.minimum_years_experience is None or job.minimum_years_experience <= 0:
            publication_blockers.append("minimum_years_experience")
        if len(priority_skills) < 2:
            publication_blockers.append("priority_skills")
        if skill_requirements_validation.errors:
            publication_blockers.append("skill_requirements")
            validation_errors.extend(skill_requirements_validation.errors)
            suggestions.extend(skill_requirements_validation.errors)

        # Determine status and can_publish
        status = "weak" if score < 50 else ("acceptable" if score < 75 else "good")
        can_publish = score >= 50 and not publication_blockers

        # Additional warnings/suggestions based on total skills
        if total_skills > 12:
            suggestions.append("Muitas skills no total. Considere priorizar as mais importantes.")

        return JobQualityResult(
            quality_score=min(100, score),  # Cap at 100
            status=status,
            can_publish=can_publish,
            publication_blockers=publication_blockers,
            missing_fields=missing_fields,
            suggestions=suggestions,
            warnings=warnings,
            validation_errors=list(dict.fromkeys(validation_errors)),
        )

    @staticmethod
    def _resolve_effective_skill_requirements(
        job: JobModel,
        skills: list[dict],
        warnings: list[str],
    ) -> dict[str, list[str]]:
        priority_skills = [
            str(skill.get("name") or "").strip()
            for skill in skills
            if is_priority_skill(skill.get("priority_level")) and str(skill.get("name") or "").strip()
        ]
        complementary_skills = [
            str(skill.get("name") or "").strip()
            for skill in skills
            if is_complementary_skill(skill.get("priority_level")) and str(skill.get("name") or "").strip()
        ]
        eliminatory_skills = [
            str(skill.get("name") or "").strip()
            for skill in skills
            if is_eliminatory_skill(skill.get("priority_level")) and str(skill.get("name") or "").strip()
        ]
        if priority_skills or complementary_skills or eliminatory_skills:
            derived = {
                "priority": priority_skills,
                "complementary": complementary_skills,
                "eliminatory": eliminatory_skills,
            }
            if job.skill_requirements is not None and validate_skill_requirements(job.skill_requirements) != derived:
                warnings.append(
                    "skill_requirements divergente; usando skills vinculadas como requisitos efetivos."
                )
            elif job.skill_requirements is None:
                warnings.append(
                    "skill_requirements ausente; usando skills vinculadas como requisitos efetivos."
                )
            return derived

        if job.skill_requirements is not None:
            return validate_skill_requirements(job.skill_requirements)

        return {
            "priority": [],
            "complementary": [],
            "eliminatory": [],
        }

    @staticmethod
    def _append_skill_configuration_alerts(
        *,
        job: JobModel,
        priority_skills: list[dict],
        complementary_skills: list[dict],
        warnings: list[str],
    ) -> None:
        priority_names = [str(skill.get("name") or "").strip() for skill in priority_skills]
        complementary_names = [str(skill.get("name") or "").strip() for skill in complementary_skills]
        all_relevant_skills = [*priority_names, *complementary_names]

        if JobQualityValidatorService._is_technical_job(job) and len(priority_names) < 3:
            warnings.append(
                "Poucas skills essenciais para uma vaga técnica. Com menos de 3 essenciais, o ranking pode ficar permissivo."
            )

        if len(complementary_names) > 12:
            warnings.append(
                "Diferenciais em excesso podem reduzir a clareza da vaga. Considere manter até 12 skills diferenciais."
            )

        if not JobQualityValidatorService._is_full_stack_job(job):
            return

        if not JobQualityValidatorService._contains_any_skill_hint(
            all_relevant_skills,
            _FRONTEND_SKILL_HINTS,
        ):
            warnings.append(
                "Vaga Full Stack sem skill clara de frontend entre essenciais ou diferenciais. Considere incluir Frontend, React, Vue ou Angular."
            )

        if not JobQualityValidatorService._contains_any_skill_hint(
            all_relevant_skills,
            _BACKEND_SKILL_HINTS,
        ):
            warnings.append(
                "Vaga Full Stack sem skill clara de backend entre essenciais ou diferenciais. Considere incluir Backend, Node.js, Java, Python ou API."
            )

    @staticmethod
    def _is_technical_job(job: JobModel) -> bool:
        normalized_area = str(job.job_area or "").strip().lower()
        if normalized_area in {"technology", "tecnologia", "data", "dados"}:
            return True

        text = " ".join(
            str(value or "").strip()
            for value in (
                job.title,
                job.description,
                job.requirements,
                job.responsibilities,
                job.experience_context,
            )
        )
        return bool(_TECHNICAL_ROLE_PATTERN.search(text))

    @staticmethod
    def _is_full_stack_job(job: JobModel) -> bool:
        text = " ".join(
            str(value or "").strip()
            for value in (
                job.title,
                job.description,
                job.requirements,
                job.responsibilities,
            )
        )
        return bool(_FULL_STACK_PATTERN.search(text))

    @staticmethod
    def _contains_any_skill_hint(skill_names: list[str], hints: tuple[str, ...]) -> bool:
        normalized_names = [str(name).strip().lower() for name in skill_names if str(name).strip()]
        return any(
            hint in normalized_name
            for normalized_name in normalized_names
            for hint in hints
        )
