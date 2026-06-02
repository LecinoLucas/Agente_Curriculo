# Importa todos os modelos para que o Alembic os detecte na autogeneration
from src.infrastructure.database.models import (
    candidate_identity_events as candidate_identity_events,
)
from src.infrastructure.database.models.admission_model import (
    Admission,
    CandidateDocument,
    DocumentRequirement,
)
from src.infrastructure.database.models.admission_package_model import (
    AdmissionExportPackageModel,
)
from src.infrastructure.database.models.ai_daily_limit_override_model import (
    AIDailyLimitOverrideModel,
)
from src.infrastructure.database.models.ai_provider_credential_model import (
    AIProviderCredentialModel,
)
from src.infrastructure.database.models.ai_provider_health_model import AIProviderHealthModel
from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    MatchingObservationModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.assistant_failure_model import AssistantFailureModel
from src.infrastructure.database.models.assistant_settings_model import (
    AssistantQuickReplyModel,
    AssistantSettingModel,
    AssistantStateContentModel,
)
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.calendar_sync_event_model import CalendarSyncEventModel
from src.infrastructure.database.models.candidate_application_model import (
    CandidateApplicationModel,
    CandidateLocationPreferenceModel,
)
from src.infrastructure.database.models.candidate_auth_token_model import CandidateAuthTokenModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_note_model import (
    CandidateNoteModel,
)
from src.infrastructure.database.models.candidate_pipeline_model import (
    CandidatePipelineModel,
    PipelineStageTransitionModel,
)
from src.infrastructure.database.models.collaboration_comments_model import (
    CollaborationCommentModel,
)
from src.infrastructure.database.models.communication_model import (
    CandidateCommunicationModel,
    CommunicationDeliveryAttemptModel,
    CommunicationTemplateModel,
)
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from src.infrastructure.database.models.conversation_otp_model import (
    ConversationOtpModel,
)
from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)
from src.infrastructure.database.models.erp_integration_attempt_model import (
    ErpIntegrationAttemptModel,
)
from src.infrastructure.database.models.google_calendar_connection_model import (
    GoogleCalendarConnectionModel,
)
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import (
    InterviewScorecardItemModel,
    InterviewScorecardModel,
)
from src.infrastructure.database.models.job_area_model import JobAreaModel
from src.infrastructure.database.models.job_model import (
    JobModel,
    JobRequiredSkillModel,
    JobUnitModel,
    SkillModel,
)
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)
from src.infrastructure.database.models.pipeline_event_model import PipelineEventModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionChecklistTemplateItemModel,
    PreAdmissionChecklistTemplateModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
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

__all__ = [
    "UserModel",
    "UserSessionModel",
    "PasswordResetTokenModel",
    "CandidateModel",
    "CandidateAuthTokenModel",
    "AssistantFailureModel",
    "AssistantStateContentModel",
    "AssistantQuickReplyModel",
    "AssistantSettingModel",
    "CandidateApplicationModel",
    "CandidateLocationPreferenceModel",
    "GoogleCalendarConnectionModel",
    "CalendarSyncEventModel",
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
    "AIProviderHealthModel",
    "AIProviderCredentialModel",
    "AIDailyLimitOverrideModel",
    "JobModel",
    "JobRequiredSkillModel",
    "SkillModel",
    "JobUnitModel",
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
    "PreAdmissionChecklistTemplateModel",
    "PreAdmissionChecklistTemplateItemModel",
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
    "ConversationSessionModel",
    "ConversationMessageModel",
    "ConversationOtpModel",
    "CollaborationCommentModel",
    "CandidateNoteModel",
    "JobAreaModel",
    "OperationalGroupModel",
    "LocationGroupModel",
    "OperationalUnitModel",
    "CandidatePipelineModel",
    "PipelineStageTransitionModel",
]
