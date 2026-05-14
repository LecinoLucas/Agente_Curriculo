# Importa todos os modelos para que o Alembic os detecte na autogeneration
from src.infrastructure.database.models.admission_model import (
    Admission,
    CandidateDocument,
    DocumentRequirement,
)
from src.infrastructure.database.models.calendar_sync_event_model import CalendarSyncEventModel
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
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    MatchingObservationModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_auth_token_model import CandidateAuthTokenModel
from src.infrastructure.database.models.google_calendar_connection_model import GoogleCalendarConnectionModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import (
    JobModel,
    JobRequiredSkillModel,
    SkillModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.skill_catalog_model import (
    SkillAliasModel,
    SkillCatalogModel,
    SkillRelationModel,
)
from src.infrastructure.database.models.user_model import (
    PasswordResetTokenModel,
    UserModel,
    UserSessionModel,
)
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import (
    InterviewScorecardItemModel,
    InterviewScorecardModel,
)
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAssignmentModel,
    BehavioralAssessmentAIEvaluationModel,
)
from src.infrastructure.database.models.admission_package_model import (
    AdmissionExportPackageModel,
)
from src.infrastructure.database.models.erp_integration_attempt_model import (
    ErpIntegrationAttemptModel,
)
from src.infrastructure.database.models.communication_model import (
    CommunicationTemplateModel,
    CandidateCommunicationModel,
    CommunicationDeliveryAttemptModel,
)
from src.infrastructure.database.models.collaboration_comments_model import (
    CollaborationCommentModel,
)

__all__ = [
    "UserModel",
    "UserSessionModel",
    "PasswordResetTokenModel",
    "CandidateModel",
    "CandidateAuthTokenModel",
    "GoogleCalendarConnectionModel",
    "CandidateJobPipelineModel",
    "CandidateJobPipelineEventModel",
    "ResumeModel",
    "ResumeVersionModel",
    "SkillCatalogModel",
    "SkillAliasModel",
    "SkillRelationModel",
    "AIModelModel",
    "PromptTemplateModel",
    "AnalysisModel",
    "AnalysisResultModel",
    "MatchingObservationModel",
    "AIUsageLogModel",
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
    "CandidateJobScoreSnapshotModel",
    "CandidateJobScoreFactorModel",
    "CandidateProfileAnalysisModel",
    "JobProfileAnalysisModel",
    "CandidateJobMatchModel",
    "InterviewScheduleModel",
    "InterviewScorecardModel",
    "InterviewScorecardItemModel",
    "CandidateJobHiringDecisionModel",
    "PreAdmissionCaseModel",
    "PreAdmissionChecklistItemModel",
    "PreAdmissionDocumentModel",
    "PreAdmissionEventModel",
    "BehavioralAssessmentTemplateModel",
    "BehavioralTemplateCompetencyModel",
    "BehavioralTemplateQuestionModel",
    "BehavioralAssessmentAssignmentModel",
    "BehavioralAssessmentAnswerModel",
    "BehavioralAssessmentAIEvaluationModel",
    "AdmissionExportPackageModel",
    "ErpIntegrationAttemptModel",
    "CommunicationTemplateModel",
    "CandidateCommunicationModel",
    "CommunicationDeliveryAttemptModel",
    "CollaborationCommentModel",
]
