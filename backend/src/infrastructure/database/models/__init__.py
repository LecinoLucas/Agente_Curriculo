# Importa todos os modelos para que o Alembic os detecte na autogeneration
from src.infrastructure.database.models.admission_model import (
    Admission,
    CandidateDocument,
    DocumentRequirement,
)
from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)
from src.infrastructure.database.models.pipeline_event_model import PipelineEventModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    MatchingObservationModel,
    PromptTemplateModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_link_model import (
    CandidateJobLinkModel,
)
from src.infrastructure.database.models.candidate_pipeline_model import (
    CandidatePipelineModel,
    PipelineStageTransitionModel,
)
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
    "CandidateJobLinkModel",
    "CandidatePipelineModel",
    "PipelineStageTransitionModel",
    "ResumeModel",
    "ResumeVersionModel",
    "AIModelModel",
    "PromptTemplateModel",
    "AnalysisModel",
    "AnalysisResultModel",
    "ResumeJobMatchModel",
    "MatchingObservationModel",
    "JobModel",
    "JobRequiredSkillModel",
    "SkillModel",
    "AuditLogModel",
    "Admission",
    "DocumentRequirement",
    "CandidateDocument",
    "DocumentAIAnalysisModel",
    "PipelineEventModel",
    "ScoreModelVersionModel",
    "CandidateJobScoreModel",
]
