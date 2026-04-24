# Importa todos os modelos para que o Alembic os detecte na autogeneration
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import (
    PasswordResetTokenModel,
    UserModel,
    UserSessionModel,
)

__all__ = [
    "UserModel",
    "UserSessionModel",
    "PasswordResetTokenModel",
    "CandidateModel",
    "ResumeModel",
    "ResumeVersionModel",
    "AIModelModel",
    "PromptTemplateModel",
    "AnalysisModel",
    "AnalysisResultModel",
    "ResumeJobMatchModel",
    "JobModel",
    "JobRequiredSkillModel",
    "SkillModel",
    "AuditLogModel",
]
