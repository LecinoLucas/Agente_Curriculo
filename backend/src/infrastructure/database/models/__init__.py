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
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
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
)
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import (
    JobModel,
    JobRequiredSkillModel,
    SkillAliasModel,
    SkillEquivalenceModel,
    SkillModel,
)
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
    "CandidateJobPipelineModel",
    "CandidateJobPipelineEventModel",
    "ResumeModel",
    "ResumeVersionModel",
    "AIModelModel",
    "PromptTemplateModel",
    "AnalysisModel",
    "AnalysisResultModel",
    "MatchingObservationModel",
    "JobModel",
    "JobRequiredSkillModel",
    "SkillModel",
    "SkillAliasModel",
    "SkillEquivalenceModel",
    "AuditLogModel",
    "Admission",
    "DocumentRequirement",
    "CandidateDocument",
    "DocumentAIAnalysisModel",
    "PipelineEventModel",
    "ScoreModelVersionModel",
    "CandidateJobScoreModel",
    "CandidateProfileAnalysisModel",
    "JobProfileAnalysisModel",
    "CandidateJobMatchModel",
]
