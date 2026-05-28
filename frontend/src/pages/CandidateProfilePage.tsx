import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarPlus,
  ChevronDown,
  Check,
  ClipboardCheck,
  Clock,
  Edit3,
  FileText,
  Loader,
  Mail,
  MapPin,
  NotebookPen,
  Phone,
  Pencil,
  RefreshCcw,
  Sparkles,
  UserX,
  UserRound,
  X,
} from "lucide-react";

import { Tabs, type Tab } from "../components/common/Tabs";
import { LinkCandidateJobModal } from "../features/candidates/components/LinkCandidateJobModal";
import { CandidateCommunicationsPanel } from "../features/candidates/drawer/components/CandidateCommunicationsPanel";
import { CandidateHiringDecisionPanel } from "../features/candidates/drawer/components/CandidateHiringDecisionPanel";
import { InterviewScorecardPanel } from "../features/candidates/drawer/components/InterviewScorecardPanel";
import { CandidateNotesTab } from "../features/candidates/drawer/components/CandidateNotesTab";
import { CandidatePreAdmissionPanel } from "../features/candidates/drawer/components/CandidatePreAdmissionPanel";
import {
  PreAdmissionStartDrawer,
  type PreAdmissionStartDrawerResult,
} from "../features/candidates/drawer/components/PreAdmissionStartDrawer";
import { useCandidateData } from "../features/candidates/drawer/hooks/useCandidateData";
import { useCandidateDecision } from "../features/candidates/drawer/hooks/useCandidateDecision";
import { ScoreTab as CandidateScoreDetailsTab } from "../features/candidates/drawer/tabs/ScoreTab";
import { useCandidateOverview } from "../features/candidates/hooks/useCandidateOverview";
import {
  getVisibleCandidateProfileTabs,
  isCandidateProfileTabKey,
  type CandidateProfileTabKey,
} from "../features/candidates/profile/utils/getVisibleCandidateProfileTabs";
import {
  ANALYSIS_STATUS_LABEL,
  STAGE_LABEL,
  deriveNextAction,
  derivePendencies,
  formatScorePercent,
  getActiveJobScore,
  getActivePipelineEntry,
  getInitials,
  isPostHiringActiveStage,
  isSuccessTerminalStage,
  type NextActionSuggestion,
} from "../features/candidates/utils/profile";
import { EditCandidateModal } from "../features/pipeline/EditCandidateModal";
import {
  INTERVIEW_TYPE_LABELS,
  formatInterviewDateTime,
  interviewFormatLabel,
  interviewStatusLabel,
  interviewTypeLabel,
  scorecardActionLabel,
  scorecardStatusLabel,
} from "../features/agenda/interviewDisplay";
import { PipelineRejectionReasonModal } from "../features/pipeline/PipelineRejectionReasonModal";
import { PipelineTransitionBlockedModal } from "../features/pipeline/PipelineTransitionBlockedModal";
import {
  resolvePreAdmissionNavigationPath,
  usePipelineGateActionResolver,
  usePipelineTransitionBlockedHandler,
} from "../features/pipeline/usePipelineTransitionBlocked";
import { AILimitIncreaseModal } from "../features/admin/AILimitIncreaseModal";
import { useAuth } from "../features/auth/useAuth";
import { parseQuestionText } from "../features/behavioral-templates/behavioralTemplateHelper";
import { agendaService } from "../services/agendaService";
import { analysisService } from "../services/analysisService";
import { aiLimitsService, type AILimitsUsage } from "../services/aiLimitsService";
import { candidatesService } from "../services/candidatesService";
import { HttpError } from "../services/http";
import { getBehavioralEvaluation, triggerBehavioralAnalysis } from "../services/behavioralAIEvaluationService";
import { getCandidateBehavioralAssessment } from "../services/behavioralAssessmentService";
import { formatContextError } from "../services/errorMessages";
import { listJobs } from "../services/jobsService";
import { pipelineService } from "../services/pipelineService";
import { createPreAdmission, getPreAdmission } from "../services/preAdmissionService";
import { resumeService } from "../services/resumeService";
import { scoreExplanationService, type ScoreExplanationResponse } from "../services/scoreExplanationService";
import { toast } from "../shared/utils/toast";
import type {
  AnalysisResult,
  AnalysisStatus,
  CandidateOverview,
  CandidatePipelineEntryOverview,
  CandidatePreviewPendencyOverview,
  CandidateProcessHistory,
  CandidateProcessHistoryItem,
  BehavioralAIEvaluationResponse,
  BehavioralAssignmentAnswer,
  BehavioralAssignmentDetailResponse,
  Job,
  JobRankingEntry,
  PipelineStage,
  PreAdmissionEnvelope,
  Resume,
  ResumeVersion,
} from "../types/domain";
import type { InterviewFormat, InterviewSchedule, InterviewType } from "../types/agenda";

const PROFILE_TABS: Tab[] = [
  { key: "overview", label: "Visão geral" },
  { key: "workflow", label: "Ações" },
  { key: "pre_admission", label: "Pré-admissão" },
  { key: "score", label: "Score e análise" },
  { key: "documents", label: "Currículo e documentos" },
  { key: "interviews", label: "Entrevistas" },
  { key: "assessments", label: "Avaliações" },
  { key: "communications", label: "Comunicação" },
  { key: "notes", label: "Observações" },
  { key: "history", label: "Histórico" },
];

function resolveSearchTab(search: string): CandidateProfileTabKey | null {
  const tab = new URLSearchParams(search).get("tab");
  return isCandidateProfileTabKey(tab) ? tab : null;
}

function resolveInitialTab(search: string): CandidateProfileTabKey {
  return resolveSearchTab(search) ?? "overview";
}

type CandidateProfileFocus = "behavioral_ai" | "scorecard" | "hiring_decision" | "manager_review";

function resolveInitialFocus(search: string): CandidateProfileFocus | null {
  const focus = new URLSearchParams(search).get("focus");
  if (focus === "behavioral_ai") return focus;
  if (focus === "scorecard") return focus;
  if (focus === "hiring_decision") return focus;
  if (focus === "manager_review") return focus;
  return null;
}

export function CandidateProfilePage() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<CandidateProfileTabKey>(() =>
    resolveInitialTab(location.search),
  );
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [linkJobOpen, setLinkJobOpen] = useState(false);
  const [rankingSyncTick, setRankingSyncTick] = useState(0);
  const [manualAnalysisRequesting, setManualAnalysisRequesting] = useState(false);
  const [manualAnalysisStatus, setManualAnalysisStatus] = useState<AnalysisStatus["status"] | null>(null);
  const manualAnalysisPollingRef = useRef<number | null>(null);
  const [assessmentFocusTick, setAssessmentFocusTick] = useState(0);
  const [scorecardFocusTick, setScorecardFocusTick] = useState(0);
  const [scheduleTechnicalFocusTick, setScheduleTechnicalFocusTick] = useState(0);
  const [hiringDecisionFocusTick, setHiringDecisionFocusTick] = useState(0);
  const [scorecardFocusInterviewId, setScorecardFocusInterviewId] = useState<string | null>(null);
  const [dailyLimitDialogOpen, setDailyLimitDialogOpen] = useState(false);
  const [dailyLimitUsage, setDailyLimitUsage] = useState<AILimitsUsage | null>(null);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [preAdmissionEnvelope, setPreAdmissionEnvelope] = useState<PreAdmissionEnvelope | null>(null);
  const [preAdmissionLoading, setPreAdmissionLoading] = useState(false);
  const [preAdmissionStartOpen, setPreAdmissionStartOpen] = useState(false);

  // React to `?tab=…&focus=…` on URL changes. We snapshot the last applied
  // search so we don't re-fire focus on unrelated state churn (the
  // PipelinePage navigates here with focus=behavioral_ai after a blocked
  // transition; if the user then changes tab manually the URL resets and we
  // don't keep "stealing" focus from them).
  const lastAppliedSearchRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAppliedSearchRef.current === location.search) return;
    lastAppliedSearchRef.current = location.search;

    const tab = resolveInitialTab(location.search);
    const focus = resolveInitialFocus(location.search);

    setActiveTab(tab);

    if (tab === "assessments" && focus === "behavioral_ai") {
      // Trigger the existing scroll/focus mechanism inside
      // ProfileBehavioralAssessmentsTab. The tab itself is the destination;
      // the tick is what causes scrollIntoView to run.
      setAssessmentFocusTick((current) => current + 1);
    }
    if (tab === "interviews" && focus === "scorecard") {
      setScorecardFocusInterviewId(new URLSearchParams(location.search).get("interview_id"));
      setScorecardFocusTick((current) => current + 1);
    }
    if (tab === "workflow" && (focus === "hiring_decision" || focus === "manager_review")) {
      setHiringDecisionFocusTick((current) => current + 1);
    }
  }, [location.search]);

  const {
    blockedTransition,
    handleBlockedError,
    closeBlocked,
    submitForce,
    forceSubmitting,
    forceError,
  } = usePipelineTransitionBlockedHandler();
  const resolveBlockedAction = usePipelineGateActionResolver(closeBlocked);

  const { overview, loading, error, notFound, reload } = useCandidateOverview(candidateId ?? null);
  const activeEntry = useMemo(() => getActivePipelineEntry(overview), [overview]);
  const activeScore = useMemo(() => getActiveJobScore(overview, activeEntry), [overview, activeEntry]);
  const profileEntry = activeEntry ?? overview?.pipeline_entries[0] ?? null;
  const profileJobId = activeEntry?.job_id ?? overview?.active_job_id ?? profileEntry?.job_id ?? null;
  const historyFocusJobId = useMemo(
    () => new URLSearchParams(location.search).get("job_id"),
    [location.search],
  );
  const profilePanelTab = activeTab === "score" ? "score" : "summary";
  const {
    rankingEntry,
    rankingEntryLoading,
    rankingEntryError,
    rankingEntryScoreNotReady,
    analysisResult,
  } = useCandidateData({
    candidateOverview: overview,
    candidateActiveJobId: profileJobId,
    activePanelTab: profilePanelTab,
    rankingSyncTick,
  });
  const {
    activeJob,
    compatibilityGuidance,
    transferAvailableJobs,
    canTransferCurrentJob,
  } = useCandidateDecision({
    candidateOverview: overview,
    candidateActiveJobId: profileJobId,
    jobs,
    rankingEntry,
  });
  const explicitProfileTab = useMemo(() => resolveSearchTab(location.search), [location.search]);
  const hasBehavioralAssessmentForProfileTabs = useMemo(
    () =>
      Boolean(activeJob?.requires_behavioral_assessment) ||
      (overview?.preview_pendencies ?? []).some(
        (pendency) => pendency.action === "open_behavioral_assessment",
      ),
    [activeJob?.requires_behavioral_assessment, overview?.preview_pendencies],
  );
  const hasBehavioralAiForProfileTabs = useMemo(
    () =>
      Boolean(activeJob?.requires_behavioral_ai_evaluation) ||
      (overview?.preview_pendencies ?? []).some(
        (pendency) => pendency.action === "open_behavioral_ai",
      ),
    [activeJob?.requires_behavioral_ai_evaluation, overview?.preview_pendencies],
  );
  const hasInterviewsForProfileTabs = useMemo(
    () =>
      (overview?.preview_pendencies ?? []).some(
        (pendency) => pendency.action === "open_interview" || pendency.action === "open_scorecard",
      ) ||
      profileEntry?.stage === "hr_interview" ||
      profileEntry?.stage === "technical_interview" ||
      profileEntry?.stage === "final" ||
      profileEntry?.stage === "offer",
    [
      overview?.preview_pendencies,
      profileEntry?.stage,
    ],
  );
  const hasHiringDecisionForProfileTabs = useMemo(
    () =>
      (overview?.preview_pendencies ?? []).some((pendency) => pendency.action === "open_decision") ||
      profileEntry?.stage === "offer" ||
      profileEntry?.stage === "hired" ||
      profileEntry?.stage === "pre_admission" ||
      profileEntry?.stage === "protheus" ||
      profileEntry?.stage === "admitted",
    [overview?.preview_pendencies, profileEntry?.stage],
  );
  const hasPreAdmissionForProfileTabs = Boolean(preAdmissionEnvelope?.case);
  const visibleProfileTabKeys = useMemo(
    () =>
      getVisibleCandidateProfileTabs({
        activeJobId: profileJobId,
        pipelineStage: profileEntry?.stage ?? null,
        relationshipStatus: profileEntry?.relationship_status ?? null,
        isTerminal:
          Boolean(profileEntry?.is_terminal) ||
          isSuccessTerminalStage(profileEntry?.stage) ||
          profileEntry?.stage === "rejected" ||
          profileEntry?.relationship_status === "rejected",
        hasAnalysis: Boolean(overview?.latest_analysis),
        hasScore: activeScore !== null,
        hasBehavioralAssessment: hasBehavioralAssessmentForProfileTabs,
        hasBehavioralAi: hasBehavioralAiForProfileTabs,
        hasInterviews: hasInterviewsForProfileTabs,
        hasHiringDecision: hasHiringDecisionForProfileTabs,
        hasPreAdmissionCase: hasPreAdmissionForProfileTabs,
        hasCommunication: true,
        hasNotes: true,
        hasProcessHistory: true,
        userRole: user?.role ?? "viewer",
        explicitTab: explicitProfileTab,
      }),
    [
      activeScore,
      explicitProfileTab,
      hasBehavioralAiForProfileTabs,
      hasBehavioralAssessmentForProfileTabs,
      hasHiringDecisionForProfileTabs,
      hasInterviewsForProfileTabs,
      hasPreAdmissionForProfileTabs,
      overview?.latest_analysis,
      profileEntry?.is_terminal,
      profileEntry?.relationship_status,
      profileEntry?.stage,
      profileJobId,
      user?.role,
    ],
  );
  const visibleProfileTabs = useMemo(
    () => PROFILE_TABS.filter((tab) => visibleProfileTabKeys.includes(tab.key as CandidateProfileTabKey)),
    [visibleProfileTabKeys],
  );
  const canAccessPreAdmission = user?.role === "admin" || user?.role === "hr" || user?.role === "recruiter";
  const loadPreAdmissionEnvelope = useCallback(async () => {
    if (!candidateId || !profileJobId || !canAccessPreAdmission) {
      setPreAdmissionEnvelope(null);
      setPreAdmissionLoading(false);
      return null;
    }

    setPreAdmissionLoading(true);
    try {
      const payload = await getPreAdmission(profileJobId, candidateId);
      setPreAdmissionEnvelope(payload);
      return payload;
    } catch (requestError) {
      setPreAdmissionEnvelope(null);
      toast.error(
        formatContextError(
          requestError,
          "Não foi possível carregar o estado da pré-admissão.",
          "A ação admissional pode ficar temporariamente indisponível.",
        ),
      );
      return null;
    } finally {
      setPreAdmissionLoading(false);
    }
  }, [canAccessPreAdmission, candidateId, profileJobId]);
  const nextAction = useMemo(
    () =>
      deriveNextAction(overview, activeEntry, {
        preAdmission: {
          hasAccess: canAccessPreAdmission,
          hasActiveCase: Boolean(preAdmissionEnvelope?.case),
          canCreateCase: preAdmissionEnvelope?.can_create,
          hiringDecisionOutcome: preAdmissionEnvelope?.hiring_decision_outcome ?? null,
        },
      }),
    [activeEntry, canAccessPreAdmission, overview, preAdmissionEnvelope?.can_create, preAdmissionEnvelope?.case, preAdmissionEnvelope?.hiring_decision_outcome],
  );
  const canManuallyChangeStageFromHeader = Boolean(
    activeEntry &&
      !isSuccessTerminalStage(activeEntry.stage) &&
      activeEntry.stage !== "rejected",
  );
  const canRunPrimaryAction = Boolean(
    nextAction.actionable !== false &&
      nextAction.targetTab &&
      (!nextAction.targetTab.startsWith("pre_admission") || canAccessPreAdmission) &&
      !(preAdmissionLoading && nextAction.targetTab.startsWith("pre_admission")),
  );

  useEffect(() => {
    if (visibleProfileTabKeys.includes(activeTab)) return;
    setActiveTab(visibleProfileTabKeys[0] ?? "overview");
  }, [activeTab, visibleProfileTabKeys]);

  useEffect(() => {
    if (!canAccessPreAdmission) {
      setPreAdmissionEnvelope(null);
      setPreAdmissionLoading(false);
      return;
    }
    void loadPreAdmissionEnvelope();
  }, [canAccessPreAdmission, loadPreAdmissionEnvelope]);

  const reloadWorkspace = useCallback(async () => {
    await reload();
    setRankingSyncTick((current) => current + 1);
    await loadPreAdmissionEnvelope();
  }, [loadPreAdmissionEnvelope, reload]);

  const handleCreatePreAdmissionCase = useCallback(async (): Promise<PreAdmissionStartDrawerResult> => {
    if (!canAccessPreAdmission) {
      throw new HttpError(403, "Acesso restrito ao RH.");
    }
    if (!candidateId || !profileJobId) {
      throw new Error("Não foi possível identificar o candidato ou a vaga para iniciar a pré-admissão.");
    }

    try {
      const created = await createPreAdmission(profileJobId, candidateId, {});
      setPreAdmissionEnvelope({
        case: created,
        can_create: false,
        hiring_decision_outcome: "hire",
      });
      toast.success("Caso admissional criado.");
      return { caseId: created.id };
    } catch (requestError) {
      if (requestError instanceof HttpError && requestError.status === 403) {
        throw requestError;
      }

      const refreshed = await loadPreAdmissionEnvelope();
      if (refreshed?.case?.id) {
        return {
          caseId: refreshed.case.id,
          reusedExistingCase: true,
        };
      }
      throw requestError;
    }
  }, [canAccessPreAdmission, candidateId, loadPreAdmissionEnvelope, profileJobId]);

  const handlePreAdmissionStartSuccess = useCallback(async () => {
    setPreAdmissionStartOpen(false);
    setActiveTab("pre_admission");
    await reloadWorkspace();
  }, [reloadWorkspace]);

  useEffect(() => {
    setManualAnalysisStatus(null);
  }, [candidateId, profileJobId]);

  useEffect(() => {
    return () => {
      if (manualAnalysisPollingRef.current !== null) {
        window.clearInterval(manualAnalysisPollingRef.current);
      }
    };
  }, []);

  const startManualAnalysisPolling = useCallback(
    (analysisId: string) => {
      if (manualAnalysisPollingRef.current !== null) {
        window.clearInterval(manualAnalysisPollingRef.current);
      }

      let attempts = 0;
      const terminalStatuses = new Set<AnalysisStatus["status"]>([
        "completed",
        "failed",
        "cancelled",
        "discarded",
      ]);

      manualAnalysisPollingRef.current = window.setInterval(() => {
        attempts += 1;
        void analysisService
          .status(analysisId)
          .then(async (payload) => {
            setManualAnalysisStatus(payload.status);
            await reloadWorkspace();
            if (terminalStatuses.has(payload.status) || attempts >= 12) {
              if (manualAnalysisPollingRef.current !== null) {
                window.clearInterval(manualAnalysisPollingRef.current);
                manualAnalysisPollingRef.current = null;
              }
            }
          })
          .catch(async () => {
            await reloadWorkspace();
            if (attempts >= 12 && manualAnalysisPollingRef.current !== null) {
              window.clearInterval(manualAnalysisPollingRef.current);
              manualAnalysisPollingRef.current = null;
            }
          });
      }, 5000);
    },
    [reloadWorkspace],
  );

  const getAnalysisResumeVersionId = useCallback(() => {
    const activeResume = overview?.resumes.find((resume) => resume.status === "active") ?? overview?.resumes[0] ?? null;
    return activeEntry?.resume_version_id ?? profileEntry?.resume_version_id ?? activeResume?.current_version_id ?? null;
  }, [activeEntry?.resume_version_id, overview?.resumes, profileEntry?.resume_version_id]);

  const handleRequestActiveJobAnalysis = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!profileJobId || manualAnalysisRequesting) return;

      const effectiveStatus = manualAnalysisStatus ?? overview?.active_job_decision?.analysis_status ?? null;
      if (effectiveStatus === "pending" || effectiveStatus === "processing" || effectiveStatus === "retry_scheduled") {
        toast.info("Análise em andamento.");
        return;
      }

      const resumeVersionId = getAnalysisResumeVersionId();
      if (!resumeVersionId) {
        toast.error("Envie um currículo antes de solicitar a análise.");
        return;
      }

      setManualAnalysisRequesting(true);
      setManualAnalysisStatus("pending");
      try {
        const response = await analysisService.request(resumeVersionId, profileJobId, {
          force: options.force ?? true,
        });
        setManualAnalysisStatus(response.status);
        toast.info("Análise IA enviada para a fila.");
        await reloadWorkspace();
        if (
          response.status === "pending" ||
          response.status === "processing" ||
          response.status === "retry_scheduled"
        ) {
          startManualAnalysisPolling(response.analysis_id);
        }
      } catch (err: unknown) {
        setManualAnalysisStatus(null);
        // P0.2C: daily-limit-exceeded gets a distinct message; admins also see
        // a "Aumentar limite" CTA (the modal lives in Admin > Health > IA/Tokens).
        if (err instanceof HttpError && err.code === "ai_daily_limit_exceeded") {
          if (user?.role === "admin") {
            void aiLimitsService
              .getUsage()
              .then((usage) => setDailyLimitUsage(usage))
              .catch(() => undefined);
            setDailyLimitDialogOpen(true);
          } else {
            toast.error("Limite diário de análises atingido. Solicite liberação a um administrador.");
          }
        } else {
          toast.error(
            formatContextError(
              err,
              "Não foi possível solicitar a análise.",
              "Tente novamente em alguns instantes.",
            ),
          );
        }
      } finally {
        setManualAnalysisRequesting(false);
      }
    },
    [
      getAnalysisResumeVersionId,
      manualAnalysisRequesting,
      manualAnalysisStatus,
      overview?.active_job_decision?.analysis_status,
      profileJobId,
      reloadWorkspace,
      startManualAnalysisPolling,
      user?.role,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void listJobs(1, 100, { statusFilter: "all" })
      .then((response) => {
        if (cancelled) return;
        setJobs(response.data);
        setJobsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setJobsError(
          formatContextError(
            err,
            "Não foi possível carregar vagas para ações do candidato.",
            "As ações de vínculo e transferência podem ficar indisponíveis.",
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMoveStage = useCallback(
    async (stage: PipelineStage, reason?: string | null) => {
      if (!candidateId || !profileJobId) return false;
      setWorkflowSaving(true);
      try {
        const moveResult = await pipelineService.moveCandidateStage(profileJobId, candidateId, {
          stage,
          reason: reason?.trim() || null,
          notes: reason?.trim() || null,
        });
        const preAdmissionPath = resolvePreAdmissionNavigationPath(moveResult);
        if (preAdmissionPath) {
          navigate(preAdmissionPath);
          return true;
        }
        toast.success("Etapa atualizada.");
        await reloadWorkspace();
        return true;
      } catch (err: unknown) {
        const handled = handleBlockedError(err, {
          candidateId,
          candidateName: overview?.candidate?.full_name ?? null,
        });
        if (handled) {
          // Backend rejected the move: refetch so the page reflects the
          // unchanged server stage.
          await reloadWorkspace();
        } else {
          toast.error(
            formatContextError(
              err,
              "Não foi possível mover o candidato.",
              "Revise o estado atual do pipeline e tente novamente.",
            ),
          );
        }
        return false;
      } finally {
        setWorkflowSaving(false);
      }
    },
    [candidateId, handleBlockedError, navigate, overview?.candidate?.full_name, profileJobId, reloadWorkspace],
  );

  const handleTransfer = useCallback(
    async (toJobId: string, reason: string) => {
      if (!candidateId || !profileJobId) return;
      setWorkflowSaving(true);
      try {
        await pipelineService.transferCandidateJob(candidateId, {
          from_job_id: profileJobId,
          to_job_id: toJobId,
          reason: reason.trim(),
        });
        toast.success("Candidato transferido.");
        await reloadWorkspace();
      } catch (err: unknown) {
        toast.error(
          formatContextError(
            err,
            "Não foi possível transferir o candidato.",
            "Use apenas vagas publicadas ou pausadas e tente novamente.",
          ),
        );
      } finally {
        setWorkflowSaving(false);
      }
    },
    [candidateId, profileJobId, reloadWorkspace],
  );

  const handleSuggestedAction = useCallback(
    (action: NextActionSuggestion) => {
      if (!action.targetTab) return;

      if (action.targetTab === "link_job") {
        setLinkJobOpen(true);
        return;
      }
      if (action.targetTab === "assessments" || action.targetTab === "assessments:behavioral_ai") {
        setActiveTab("assessments");
        setAssessmentFocusTick((current) => current + 1);
        return;
      }
      if (action.targetTab === "workflow") {
        setActiveTab("workflow");
        return;
      }
      if (action.targetTab === "pre_admission:create") {
        if (!canAccessPreAdmission) return;
        if (preAdmissionEnvelope?.case?.id) {
          setActiveTab("pre_admission");
          return;
        }
        setPreAdmissionStartOpen(true);
        return;
      }
      if (action.targetTab === "pre_admission") {
        if (!canAccessPreAdmission) return;
        setActiveTab("pre_admission");
        return;
      }
      if (action.targetTab === "workflow:hiring_decision") {
        setActiveTab("workflow");
        setHiringDecisionFocusTick((current) => current + 1);
        return;
      }
      if (action.targetTab === "interviews" || action.targetTab === "interviews:schedule_technical") {
        setActiveTab("interviews");
        if (action.targetTab === "interviews:schedule_technical") {
          setScheduleTechnicalFocusTick((current) => current + 1);
        }
        return;
      }
    },
    [canAccessPreAdmission, preAdmissionEnvelope?.case?.id],
  );

  if (!candidateId) {
    return (
      <PageShell>
        <EmptyBlock title="Candidato inválido" description="Identificador ausente na URL." />
      </PageShell>
    );
  }

  if (loading && !overview) {
    return (
      <PageShell>
        <LoadingSkeleton />
      </PageShell>
    );
  }

  if (notFound) {
    return (
      <PageShell>
        <EmptyBlock
          title="Candidato não encontrado"
          description="Esse candidato pode ter sido removido ou você não tem acesso."
          actionLabel="Voltar para pipeline"
          onAction={() => navigate("/pipeline")}
        />
      </PageShell>
    );
  }

  if (error && !overview) {
    return (
      <PageShell>
        <EmptyBlock
          title="Não foi possível carregar o candidato"
          description={error}
          actionLabel="Tentar novamente"
          onAction={() => void reload()}
        />
      </PageShell>
    );
  }

  if (!overview) {
    return (
      <PageShell>
        <LoadingSkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <nav aria-label="breadcrumb" className="mb-4">
        <Link
          to={profileJobId ? `/pipeline/${profileJobId}` : "/pipeline"}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Pipeline
        </Link>
      </nav>

      <ProfileHeader
        overview={overview}
        activeEntry={activeEntry}
        activeScore={activeScore}
        primaryActionLabel={canRunPrimaryAction ? nextAction.label : null}
        onPrimaryAction={canRunPrimaryAction ? () => handleSuggestedAction(nextAction) : undefined}
        onAddNote={() => setActiveTab("notes")}
        onEdit={() => setEditOpen(true)}
        onViewScore={() => setActiveTab("score")}
        onOpenManualStage={() => setActiveTab("workflow")}
        onOpenTransferJob={() => setActiveTab("workflow")}
        canShowManualStage={canManuallyChangeStageFromHeader}
        canShowTransferJob={canTransferCurrentJob}
      />

      <DecisionCards
        overview={overview}
        activeEntry={activeEntry}
        nextAction={nextAction}
        activeScore={activeScore}
        onPrimaryAction={canRunPrimaryAction ? () => handleSuggestedAction(nextAction) : undefined}
      />

      <section className="mt-8 overflow-hidden rounded-2xl border border-[hsl(var(--border)/0.7)] bg-surface shadow-sm">
        <div className="overflow-x-auto px-2">
          <Tabs
            tabs={visibleProfileTabs}
            active={activeTab}
            onChange={(key) => setActiveTab(key as CandidateProfileTabKey)}
          />
        </div>

        <div className="p-5 lg:p-6">
          {activeTab === "overview" ? (
            <OverviewTab overview={overview} activeEntry={activeEntry} activeScore={activeScore} />
          ) : null}
          {activeTab === "workflow" ? (
            <WorkflowTab
              overview={overview}
              activeEntry={profileEntry}
              activeJob={activeJob}
              jobsError={jobsError}
              transferJobs={transferAvailableJobs}
              canTransfer={canTransferCurrentJob}
              saving={workflowSaving}
              onMoveStage={handleMoveStage}
              onRequestReject={() => setRejectionModalOpen(true)}
              onTransfer={handleTransfer}
              onLinkJob={() => setLinkJobOpen(true)}
              onEdit={() => setEditOpen(true)}
              onOpenPreAdmission={() => setActiveTab("pre_admission")}
              onOpenNotes={() => setActiveTab("notes")}
              onOpenHistory={() => setActiveTab("history")}
              hiringDecisionFocusToken={hiringDecisionFocusTick}
              onDecisionSubmitted={reloadWorkspace}
              hiringDecisionOutcome={preAdmissionEnvelope?.hiring_decision_outcome ?? null}
            />
          ) : null}
          {activeTab === "pre_admission" ? (
            <CandidatePreAdmissionPanel
              caseId={preAdmissionEnvelope?.case?.id ?? null}
              jobId={profileJobId}
              candidateId={candidateId}
              userRole={user?.role ?? "viewer"}
              candidateName={overview?.candidate.full_name ?? null}
              jobTitle={activeEntry?.job_title ?? activeJob?.title ?? null}
              currentStage={profileEntry?.stage ?? null}
              sendingToProtheus={workflowSaving && profileEntry?.stage === "pre_admission"}
              onSendToProtheus={() => handleMoveStage("protheus", "Pré-admissão concluída.")}
              onOpenHiringDecision={() => {
                setActiveTab("workflow");
                setHiringDecisionFocusTick((current) => current + 1);
              }}
              initialEnvelope={preAdmissionEnvelope}
              onCaseCreated={async () => {
                await reloadWorkspace();
              }}
            />
          ) : null}
          {activeTab === "score" ? (
            <ProfileScoreTab
              overview={overview}
              activeJobId={profileJobId}
              activeJob={activeJob}
              activePipelineEntry={activeEntry}
              rankingEntry={rankingEntry}
              analysisResult={analysisResult}
              loading={rankingEntryLoading}
              error={rankingEntryError}
              scoreNotReady={rankingEntryScoreNotReady}
              analysisRequesting={manualAnalysisRequesting}
              manualAnalysisStatus={manualAnalysisStatus}
              onRequestAnalysis={handleRequestActiveJobAnalysis}
              compatibilityGuidance={compatibilityGuidance}
              scoreExplanation={null}
            />
          ) : null}
          {activeTab === "documents" ? (
            <ProfileDocumentsTab overview={overview} onReload={reloadWorkspace} />
          ) : null}
          {activeTab === "interviews" ? (
            <ProfileInterviewsTab
              jobId={profileJobId}
              candidateId={candidateId}
              previewPendencies={overview?.preview_pendencies ?? []}
              hasTechnicalInterviewPendency={overview?.preview_pendencies?.some(p => p.id === "technical_interview_not_completed") ?? false}
              focusToken={scorecardFocusTick}
              scheduleTechnicalFocusToken={scheduleTechnicalFocusTick}
              focusInterviewId={scorecardFocusInterviewId}
              onAfterInterviewChange={reloadWorkspace}
              onOpenHistory={() => setActiveTab("history")}
            />
          ) : null}
          {activeTab === "assessments" ? (
            <ProfileBehavioralAssessmentsTab
              jobId={profileJobId}
              candidateId={candidateId}
              required={activeJob?.requires_behavioral_assessment ?? false}
              requiresAI={activeJob?.requires_behavioral_ai_evaluation ?? false}
              focusToken={assessmentFocusTick}
              onAfterBehavioralAIRequest={reloadWorkspace}
              onOpenHistory={() => setActiveTab("history")}
            />
          ) : null}
          {activeTab === "communications" ? (
            <CandidateCommunicationsPanel jobId={profileJobId} candidateId={candidateId} />
          ) : null}
          {activeTab === "notes" ? <CandidateNotesTab candidateId={candidateId} /> : null}
          {activeTab === "history" ? (
            <HistoryTab
              overview={overview}
              activeJobId={profileJobId}
              focusJobId={historyFocusJobId}
            />
          ) : null}
        </div>
      </section>

      <EditCandidateModal
        isOpen={editOpen}
        candidate={overview.candidate}
        onClose={() => setEditOpen(false)}
        onSuccess={reloadWorkspace}
      />
      <LinkCandidateJobModal
        isOpen={linkJobOpen}
        candidateId={candidateId}
        candidateName={overview.candidate.full_name}
        linkedJobIds={overview.pipeline_entries.map((entry) => entry.job_id)}
        onClose={() => setLinkJobOpen(false)}
        onLinked={reloadWorkspace}
      />
      {dailyLimitUsage ? (
        <AILimitIncreaseModal
          open={dailyLimitDialogOpen}
          onClose={() => setDailyLimitDialogOpen(false)}
          onCreated={() => {
            toast.success("Limite aumentado. Você pode solicitar a análise novamente.");
          }}
          defaults={dailyLimitUsage.defaults}
        />
      ) : null}

      <PipelineTransitionBlockedModal
        open={blockedTransition !== null}
        candidateId={blockedTransition?.candidateId ?? null}
        candidateName={blockedTransition?.candidateName ?? null}
        blocked={blockedTransition?.response ?? null}
        onClose={closeBlocked}
        onResolveAction={(action) => {
          // We're already on the profile page — if the resolver would only
          // change tab/focus, do it in-place instead of navigating to the
          // same URL.
          if (action.candidateId === candidateId) {
            if (action.action === "open_interview" || action.action === "open_scorecard") {
              setActiveTab("interviews");
              closeBlocked();
              return true;
            }
            if (
              action.action === "open_behavioral_assessment" ||
              action.action === "open_behavioral_ai"
            ) {
              setActiveTab("assessments");
              if (action.action === "open_behavioral_ai") {
                setAssessmentFocusTick((current) => current + 1);
              }
              closeBlocked();
              return true;
            }
            if (action.action === "open_decision") {
              setActiveTab("workflow");
              setHiringDecisionFocusTick((current) => current + 1);
              closeBlocked();
              return true;
            }
            if (action.action === "add_reason") {
              closeBlocked();
              setRejectionModalOpen(true);
              return true;
            }
          }
          // Different candidate (rare) or unknown action: hand off to the
          // shared resolver which navigates with the proper query string.
          return resolveBlockedAction(action);
        }}
        onOpenProfile={(id) => {
          if (id === candidateId) {
            closeBlocked();
            return;
          }
          navigate(`/candidatos/${id}`);
          closeBlocked();
        }}
        forceSubmitting={forceSubmitting}
        forceError={forceError}
        onForceSubmit={async ({ candidateId: forcedId, targetStage, forceReason }) => {
          if (!profileJobId) return;
          const result = await submitForce({
            candidateId: forcedId,
            jobId: profileJobId,
            targetStage,
            forceReason,
          });
          if (result) {
            toast.success("Etapa atualizada com justificativa registrada.");
            await reloadWorkspace();
          }
        }}
      />

      <PipelineRejectionReasonModal
        open={rejectionModalOpen}
        candidateName={overview?.candidate?.full_name}
        submitting={workflowSaving}
        onClose={() => setRejectionModalOpen(false)}
        onConfirm={async (reason) => {
          await handleMoveStage("rejected", reason);
          setRejectionModalOpen(false);
        }}
      />

      <PreAdmissionStartDrawer
        open={preAdmissionStartOpen}
        candidateName={overview?.candidate.full_name ?? null}
        jobTitle={activeEntry?.job_title ?? activeJob?.title ?? null}
        onClose={() => {
          setPreAdmissionStartOpen(false);
        }}
        onConfirm={handleCreatePreAdmissionCase}
        onSuccess={handlePreAdmissionStartSuccess}
      />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[hsl(var(--bg))]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">{children}</div>
    </div>
  );
}

function ProfileHeader({
  overview,
  activeEntry,
  activeScore,
  primaryActionLabel,
  onPrimaryAction,
  onAddNote,
  onEdit,
  onViewScore,
  onOpenManualStage,
  onOpenTransferJob,
  canShowManualStage,
  canShowTransferJob,
}: {
  overview: CandidateOverview;
  activeEntry: CandidatePipelineEntryOverview | null;
  activeScore: number | null;
  primaryActionLabel: string | null;
  onPrimaryAction?: () => void;
  onAddNote: () => void;
  onEdit: () => void;
  onViewScore: () => void;
  onOpenManualStage: () => void;
  onOpenTransferJob: () => void;
  canShowManualStage: boolean;
  canShowTransferJob: boolean;
}) {
  const { candidate } = overview;
  const location = [candidate.location_city, candidate.location_state].filter(Boolean).join(", ");
  const postHiringActive =
    isPostHiringActiveStage(activeEntry?.stage) || activeEntry?.relationship_status === "hired";
  const primaryStatusLabel = activeEntry
    ? postHiringActive
      ? STAGE_LABEL[activeEntry.stage]
      : "Vaga ativa"
    : "Aguardando vaga";

  return (
    <section className="rounded-2xl border border-[hsl(var(--border)/0.7)] bg-surface p-5 shadow-sm lg:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.1)] text-lg font-bold text-[hsl(var(--primary))]">
            {getInitials(candidate.full_name)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-text">
              {candidate.full_name}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {activeEntry?.job_title ?? "Candidato sem vaga ativa"}
            </p>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-text-muted">
              {candidate.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  {candidate.email}
                </span>
              ) : null}
              {candidate.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-4 w-4" />
                  {candidate.phone}
                </span>
              ) : null}
              {location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {location}
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={activeEntry ? "success" : "neutral"}>
                {primaryStatusLabel}
              </Badge>
              {activeEntry && !postHiringActive ? (
                <Badge tone="info">{STAGE_LABEL[activeEntry.stage]}</Badge>
              ) : null}
              {activeScore != null ? (
                <Badge tone="primary">Aderência {formatScorePercent(activeScore)}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {primaryActionLabel && onPrimaryAction ? (
            <ActionButton onClick={onPrimaryAction} primary dataTestId="candidate-profile-primary-action">
              {primaryActionLabel}
            </ActionButton>
          ) : null}
          <ActionButton onClick={onAddNote}>
            <NotebookPen className="h-4 w-4" />
            Observação
          </ActionButton>
          <HeaderMoreActionsMenu
            actions={[
              { key: "edit", label: "Editar candidato", onClick: onEdit },
              { key: "score", label: "Ver score", onClick: onViewScore },
              {
                key: "manual-stage",
                label: "Alterar etapa manualmente",
                onClick: onOpenManualStage,
                visible: canShowManualStage,
              },
              {
                key: "transfer-job",
                label: "Transferir vaga",
                onClick: onOpenTransferJob,
                visible: canShowTransferJob,
              },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function HeaderMoreActionsMenu({
  actions,
}: {
  actions: Array<{
    key: string;
    label: string;
    onClick: () => void;
    visible?: boolean;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const visibleActions = actions.filter((action) => action.visible !== false);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (visibleActions.length === 0) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        data-testid="candidate-profile-more-actions"
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-text transition hover:bg-surface-muted"
      >
        Mais ações
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 min-w-[220px] rounded-xl border border-border bg-surface p-1 shadow-lg">
          {visibleActions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => {
                action.onClick();
                setOpen(false);
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-text transition hover:bg-surface-muted"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DecisionCards({
  overview,
  activeEntry,
  nextAction,
  activeScore,
  onPrimaryAction,
}: {
  overview: CandidateOverview;
  activeEntry: CandidatePipelineEntryOverview | null;
  nextAction: NextActionSuggestion;
  activeScore: number | null;
  onPrimaryAction?: () => void;
}) {
  const pendencies = derivePendencies(overview);
  const analysis = overview.latest_analysis;
  const showPrimaryAction = Boolean(onPrimaryAction && nextAction.actionable !== false);

  return (
    <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <InfoCard icon={<Briefcase className="h-5 w-5" />} title="Vaga ativa">
        <p className="text-base font-bold text-text">
          {activeEntry?.job_title ?? "Aguardando vaga"}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {activeEntry ? STAGE_LABEL[activeEntry.stage] : "Sem pipeline ativo"}
        </p>
      </InfoCard>

      <InfoCard icon={<BarChart3 className="h-5 w-5" />} title="Aderência">
        <p className="text-3xl font-bold text-text">
          {formatScorePercent(activeScore)}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {analysis ? ANALYSIS_STATUS_LABEL[analysis.status] ?? analysis.status : "Sem análise"}
        </p>
      </InfoCard>

      <InfoCard icon={<FileText className="h-5 w-5" />} title="Pendências">
        {pendencies.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma pendência.</p>
        ) : (
          <ul className="space-y-2 text-sm text-text">
            {pendencies.map((pendency) => (
              <li key={pendency.id} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    pendency.tone === "block"
                      ? "bg-rose-500"
                      : pendency.tone === "warning"
                        ? "bg-[hsl(var(--warning))]"
                        : "bg-sky-400"
                  }`}
                />
                <span className="flex flex-col">
                  <span className={pendency.tone === "block" ? "font-medium text-rose-700 dark:text-rose-400" : ""}>
                    {pendency.label}
                  </span>
                  {pendency.description ? (
                    <span className="text-xs text-text-muted">{pendency.description}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </InfoCard>

      <InfoCard icon={<Calendar className="h-5 w-5" />} title="Próxima ação">
        <p className="text-base font-bold text-text">{nextAction.label}</p>
        <p className="mt-1 text-xs text-text-muted">{nextAction.hint}</p>
        {showPrimaryAction ? (
          <button
            type="button"
            onClick={onPrimaryAction}
            data-testid="candidate-profile-next-action-button"
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-surface-muted"
          >
            {nextAction.label}
          </button>
        ) : null}
      </InfoCard>
    </section>
  );
}

function OverviewTab({
  overview,
  activeEntry,
  activeScore,
}: {
  overview: CandidateOverview;
  activeEntry: CandidatePipelineEntryOverview | null;
  activeScore: number | null;
}) {
  const { candidate } = overview;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Resumo do processo">
        <DefinitionList
          items={[
            ["Vaga ativa", activeEntry?.job_title ?? "Sem vaga ativa"],
            ["Etapa atual", activeEntry ? STAGE_LABEL[activeEntry.stage] : "-"],
            ["Status", activeEntry?.relationship_status ?? "-"],
            ["Aderência", formatScorePercent(activeScore)],
          ]}
        />
      </SectionCard>

      <SectionCard title="Dados principais">
        <DefinitionList
          items={[
            ["Nome", candidate.full_name],
            ["E-mail", candidate.email ?? "-"],
            ["Telefone", candidate.phone ?? "-"],
            [
              "Cidade/UF",
              [candidate.location_city, candidate.location_state].filter(Boolean).join(", ") || "-",
            ],
            ["Origem", candidate.application_source ?? "Manual"],
          ]}
        />
      </SectionCard>
    </div>
  );
}

const STAGE_OPTIONS: Array<{ value: PipelineStage; label: string }> = [
  { value: "entry", label: "Entrada" },
  { value: "screening", label: "Triagem" },
  { value: "hr_interview", label: "Entrevista RH" },
  { value: "technical_interview", label: "Entrevista técnica" },
  { value: "final", label: "Decisão" },
  { value: "offer", label: "Oferta" },
  { value: "hired", label: "Contratado / iniciar admissão" },
  { value: "pre_admission", label: "Pré-admissão" },
  { value: "protheus", label: "Integração ERP" },
  { value: "admitted", label: "Admitido" },
  { value: "rejected", label: "Encerrado" },
];

function WorkflowTab({
  overview,
  activeEntry,
  activeJob,
  jobsError,
  transferJobs,
  canTransfer,
  saving,
  onMoveStage,
  onRequestReject,
  onTransfer,
  onLinkJob,
  onEdit,
  onOpenPreAdmission,
  onOpenNotes,
  onOpenHistory,
  hiringDecisionFocusToken,
  onDecisionSubmitted,
  hiringDecisionOutcome = null,
}: {
  overview: CandidateOverview;
  activeEntry: CandidatePipelineEntryOverview | null;
  activeJob: Job | null;
  jobsError: string | null;
  transferJobs: Job[];
  canTransfer: boolean;
  saving: boolean;
  onMoveStage: (stage: PipelineStage, reason?: string | null) => Promise<boolean>;
  onRequestReject: () => void;
  onTransfer: (toJobId: string, reason: string) => Promise<void>;
  onLinkJob: () => void;
  onEdit: () => void;
  onOpenPreAdmission: () => void;
  onOpenNotes: () => void;
  onOpenHistory: () => void;
  hiringDecisionFocusToken: number;
  onDecisionSubmitted: () => Promise<void>;
  hiringDecisionOutcome?: string | null;
}) {
  const [stage, setStage] = useState<PipelineStage>(activeEntry?.stage ?? "entry");
  const [reason, setReason] = useState("");
  const [targetJobId, setTargetJobId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [decisionHighlighted, setDecisionHighlighted] = useState(false);
  const hiringDecisionRef = useRef<HTMLDivElement | null>(null);
  const postHiringActive =
    isPostHiringActiveStage(activeEntry?.stage) || activeEntry?.relationship_status === "hired";
  const admitted = isSuccessTerminalStage(activeEntry?.stage);
  const rejected = activeEntry?.stage === "rejected" || activeEntry?.relationship_status === "rejected";
  const terminal = rejected || admitted;
  const canMoveToHired = activeEntry?.stage === "offer" && !terminal;
  // "Mover para Pré-admissão" só aparece quando existe decisão de contratar (outcome === "hire")
  const canMoveToPreAdmission =
    activeEntry?.stage === "hired" && !terminal && hiringDecisionOutcome === "hire";
  const canMoveToProtheus = activeEntry?.stage === "pre_admission" && !terminal;
  const canMoveToAdmitted = activeEntry?.stage === "protheus" && !terminal;
  const preAdmissionNeedsAction = (overview.preview_pendencies ?? []).some(
    (pendency) => pendency.action === "open_pre_admission",
  );
  const hasPrimaryStageShortcut = canMoveToHired || canMoveToPreAdmission || canMoveToProtheus || canMoveToAdmitted;
  const decisionPendency = (overview.preview_pendencies ?? []).find((pendency) =>
    pendency.id === "final_decision_not_submitted" ||
    pendency.id === "manager_decision_missing" ||
    pendency.id === "hiring_decision_required" ||
    pendency.action === "open_decision"
  );
  const decisionDescription =
    decisionPendency?.id === "hiring_decision_required" ||
    decisionPendency?.id === "manager_decision_missing"
      ? "Registre a decisão de contratação antes de avançar para a etapa seguinte."
      : "Registro opcional para auditoria. A contratação acontece ao mover a pipeline para Contratado.";

  useEffect(() => {
    setStage(activeEntry?.stage ?? "entry");
    setReason("");
  }, [activeEntry?.job_id, activeEntry?.stage]);

  useEffect(() => {
    setTargetJobId((current) => {
      if (current && transferJobs.some((job) => job.id === current)) return current;
      return transferJobs[0]?.id ?? "";
    });
  }, [transferJobs]);

  useEffect(() => {
    if (hiringDecisionFocusToken <= 0) return;
    setDecisionHighlighted(true);
    window.setTimeout(() => {
      hiringDecisionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    const timeout = window.setTimeout(() => setDecisionHighlighted(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [hiringDecisionFocusToken]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <CurrentProcessHistoryHint
        candidateId={overview.candidate.id}
        jobId={activeEntry?.job_id ?? null}
        onOpenHistory={onOpenHistory}
        className="xl:col-span-2"
      />
      <SectionCard title="Pipeline">
        <div className="space-y-4">
          <DefinitionList
            items={[
              ["Vaga atual", activeEntry?.job_title ?? activeJob?.title ?? "Sem vaga ativa"],
              ["Etapa", activeEntry ? STAGE_LABEL[activeEntry.stage] : "-"],
              ["Status", activeEntry?.relationship_status ?? "Sem vínculo ativo"],
            ]}
          />

          {activeEntry && !terminal ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="font-semibold text-text">Mover etapa</span>
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value as PipelineStage)}
                  disabled={saving}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-text">Motivo/observação</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={saving}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Opcional, mas recomendado para reprovação ou correção de etapa."
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {canMoveToHired ? (
                  <ActionButton
                    onClick={() => void onMoveStage("hired", reason || "Contratação concluída.")}
                    disabled={saving}
                    primary
                  >
                    Mover para Contratado
                  </ActionButton>
                ) : null}
                {canMoveToPreAdmission ? (
                  <ActionButton
                    onClick={() => {
                      void onMoveStage("pre_admission", reason || "Pré-admissão iniciada.").then((moved) => {
                        if (moved) onOpenPreAdmission();
                      });
                    }}
                    disabled={saving}
                    primary
                  >
                    Mover para Pré-admissão
                  </ActionButton>
                ) : null}
                {canMoveToProtheus ? (
                  <ActionButton
                    onClick={() =>
                      preAdmissionNeedsAction
                        ? onOpenPreAdmission()
                        : void onMoveStage("protheus", reason || "Pré-admissão concluída.")
                    }
                    disabled={saving}
                    primary
                  >
                    {preAdmissionNeedsAction ? "Abrir pré-admissão" : "Mover para Integração ERP"}
                  </ActionButton>
                ) : null}
                {canMoveToAdmitted ? (
                  <ActionButton
                    onClick={() => void onMoveStage("admitted", reason || "Admissão concluída.")}
                    disabled={saving}
                    primary
                  >
                    Mover para Admitido
                  </ActionButton>
                ) : null}
                <ActionButton
                  onClick={() => void onMoveStage(stage, reason)}
                  disabled={saving || stage === activeEntry.stage}
                  primary={!hasPrimaryStageShortcut}
                >
                  Mover etapa
                </ActionButton>
                <ActionButton
                  onClick={onRequestReject}
                  disabled={saving || activeEntry.stage === "rejected"}
                >
                  Reprovar candidato
                </ActionButton>
              </div>
            </div>
          ) : activeEntry ? (
            <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4 text-sm text-text-muted">
              <p>
                {admitted
                  ? "Candidato admitido nesta vaga. O vínculo final permanece disponível no histórico da pipeline."
                  : postHiringActive
                  ? "Candidato contratado nesta vaga. O vínculo e o histórico da pipeline permanecem disponíveis."
                  : "Processo encerrado para esta vaga."}
              </p>
              {rejected ? (
                <ActionButton
                  onClick={() => void onMoveStage("screening", reason || "Candidato reconsiderado.")}
                  disabled={saving}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reconsiderar
                </ActionButton>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Este candidato não possui vaga ativa. Vincule uma vaga para liberar etapa, entrevistas e score.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={onLinkJob}>
              <Briefcase className="h-4 w-4" />
              Adicionar/vincular vaga
            </ActionButton>
            <ActionButton onClick={onEdit}>
              <Edit3 className="h-4 w-4" />
              Editar candidato
            </ActionButton>
            <ActionButton onClick={onOpenNotes}>
              <NotebookPen className="h-4 w-4" />
              Observações
            </ActionButton>
          </div>
        </div>
      </SectionCard>

      {activeEntry ? (
        <div
          ref={hiringDecisionRef}
          data-testid="hiring-decision-action-block"
          data-highlighted={decisionHighlighted ? "true" : "false"}
          className={`xl:col-span-2 rounded-xl transition ${
            decisionHighlighted
              ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2 ring-offset-[hsl(var(--bg))]"
              : ""
          }`}
        >
          <CandidateHiringDecisionPanel
            jobId={activeEntry.job_id}
            candidateId={overview.candidate.id}
            title="Decisão de contratação"
            description={decisionDescription}
            onDecisionSubmitted={onDecisionSubmitted}
          />
        </div>
      ) : null}

      <SectionCard title="Transferir candidato">
        <div className="space-y-3">
          {jobsError ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {jobsError}
            </p>
          ) : null}

          {!activeEntry ? (
            <p className="text-sm text-text-muted">
              Transferência exige vínculo atual. Use adicionar/vincular vaga.
            </p>
          ) : !canTransfer ? (
            <p className="text-sm text-text-muted">
              Transferência disponível apenas nas etapas iniciais. Para processos avançados, encerre ou reprove antes de corrigir a vaga.
            </p>
          ) : transferJobs.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nenhuma vaga disponível para transferência.
            </p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="font-semibold text-text">Vaga destino</span>
                <select
                  value={targetJobId}
                  onChange={(event) => setTargetJobId(event.target.value)}
                  disabled={saving}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {transferJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-text">Motivo da transferência</span>
                <textarea
                  value={transferReason}
                  onChange={(event) => setTransferReason(event.target.value)}
                  disabled={saving}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Explique por que o candidato deve sair da vaga atual."
                />
              </label>
              <ActionButton
                onClick={() => void onTransfer(targetJobId, transferReason)}
                disabled={saving || !targetJobId || !transferReason.trim()}
                primary
              >
                Transferir candidato
              </ActionButton>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function getScoreStrengths(scoreExplanation: ScoreExplanationResponse | null): string[] {
  if (!scoreExplanation) return [];
  const direct = [
    ...(scoreExplanation.highlights ?? []),
    ...(scoreExplanation.strengths ?? []),
    ...(scoreExplanation.high_score_reasons ?? []),
  ];
  const factors = scoreExplanation.score_factors?.positive?.map((item) => item.factor_label) ?? [];
  return Array.from(new Set([...direct, ...factors].filter(Boolean))).slice(0, 4);
}

function getScoreAttentionPoints(scoreExplanation: ScoreExplanationResponse | null): string[] {
  if (!scoreExplanation) return [];
  const direct = [
    ...(scoreExplanation.risks ?? []),
    ...(scoreExplanation.low_score_reasons ?? []),
    ...(scoreExplanation.overestimation_risks ?? []),
    ...(scoreExplanation.gaps ?? []),
  ];
  const factors = scoreExplanation.score_factors?.negative?.map((item) => item.factor_label) ?? [];
  return Array.from(new Set([...direct, ...factors].filter(Boolean))).slice(0, 4);
}

function ProfileScoreTab({
  overview,
  activeJobId,
  activeJob,
  activePipelineEntry,
  rankingEntry,
  analysisResult,
  loading,
  error,
  scoreNotReady,
  analysisRequesting,
  manualAnalysisStatus,
  onRequestAnalysis,
  compatibilityGuidance,
}: {
  overview: CandidateOverview;
  activeJobId: string | null;
  activeJob: Job | null;
  activePipelineEntry: CandidatePipelineEntryOverview | null;
  rankingEntry: JobRankingEntry | null;
  analysisResult: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  scoreNotReady: boolean;
  analysisRequesting: boolean;
  manualAnalysisStatus: AnalysisStatus["status"] | null;
  onRequestAnalysis: (options?: { force?: boolean }) => Promise<void>;
  compatibilityGuidance: ReturnType<typeof useCandidateDecision>["compatibilityGuidance"];
}) {
  const candidateId = overview.candidate.id;
  const decision = overview.active_job_decision;
  const currentAnalysisId = decision?.current_analysis_id ?? null;
  const currentAnalysisOverview =
    overview.latest_analysis?.analysis_id === currentAnalysisId ? overview.latest_analysis : null;
  const status = manualAnalysisStatus ?? decision?.analysis_status ?? null;
  const scoreStatus = decision?.score_status ?? null;
  const isProcessing =
    scoreStatus === "analysis_processing" ||
    status === "pending" ||
    status === "processing" ||
    status === "retry_scheduled";
  const [scoreExplanation, setScoreExplanation] = useState<ScoreExplanationResponse | null>(null);
  const [scoreExplanationLoading, setScoreExplanationLoading] = useState(false);

  useEffect(() => {
    if (!activeJobId || !candidateId || !currentAnalysisId || isProcessing) {
      setScoreExplanation(null);
      setScoreExplanationLoading(false);
      return;
    }

    let cancelled = false;
    setScoreExplanationLoading(true);
    void scoreExplanationService
      .get(activeJobId, candidateId)
      .then((payload) => {
        if (cancelled) return;
        if (payload.analysis_id && payload.analysis_id !== currentAnalysisId) {
          setScoreExplanation(null);
          return;
        }
        setScoreExplanation(payload);
      })
      .catch(() => {
        if (!cancelled) setScoreExplanation(null);
      })
      .finally(() => {
        if (!cancelled) setScoreExplanationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId, candidateId, currentAnalysisId, isProcessing]);

  if (!activeJobId) {
    return (
      <EmptyBlock
        title="Candidato sem vaga ativa"
        description="Vincule o candidato a uma vaga para consultar score e análise."
      />
    );
  }

  if (isProcessing) {
    return (
      <EmptyBlock
        title="Análise em andamento."
        description="A análise da vaga ativa ainda está sendo processada."
        actionLabel="Gerar análise agora"
        onAction={() => void onRequestAnalysis()}
        actionDisabled
      />
    );
  }

  if (status === "failed" || scoreStatus === "analysis_failed") {
    return (
      <EmptyBlock
        title="Análise falhou."
        description="A análise da vaga ativa não foi concluída. Solicite uma nova tentativa quando quiser."
        actionLabel={analysisRequesting ? "Solicitando..." : "Tentar novamente"}
        onAction={() => void onRequestAnalysis()}
        actionDisabled={analysisRequesting}
      />
    );
  }

  if ((scoreNotReady || (!currentAnalysisId && !rankingEntry)) && !loading) {
    const activeResumeVersionId = activePipelineEntry?.resume_version_id ?? overview.resumes[0]?.current_version_id ?? null;
    const latestExtractionStatus = (
      overview.resumes.find((r) => r.current_version_id === activeResumeVersionId)
        ?.extraction_status ?? overview.resumes[0]?.extraction_status ?? null
    )?.toLowerCase() ?? null;
    const extractionInFlight =
      latestExtractionStatus === "pending" || latestExtractionStatus === "processing";

    let title = "Análise ainda não gerada";
    let subtitle = "O candidato está vinculado à vaga ativa, mas ainda não existe análise IA canônica para este vínculo.";
    let actionLabel = analysisRequesting ? "Solicitando..." : "Gerar análise agora";
    let actionDisabled = analysisRequesting;

    if (extractionInFlight) {
      title = "Extração de currículo em andamento";
      subtitle = "Extração do currículo em andamento.";
      actionDisabled = true;
    } else if (currentAnalysisId && status === "completed") {
      title = "Matching pendente";
      subtitle = "A análise IA foi concluída, mas o matching/ranking da vaga ativa ainda não foi atualizado.";
      actionLabel = analysisRequesting ? "Solicitando..." : "Reprocessar análise";
    } else if (currentAnalysisId) {
      title = "Análise interrompida";
      subtitle = "Existe uma análise canônica para a vaga ativa, mas ela não está em processamento válido.";
      actionLabel = analysisRequesting ? "Solicitando..." : "Reprocessar análise";
    }

    return (
      <EmptyBlock
        title={title}
        description={subtitle}
        actionLabel={actionLabel}
        onAction={() => void onRequestAnalysis({ force: true })}
        actionDisabled={actionDisabled}
      />
    );
  }

  const strengths = getScoreStrengths(scoreExplanation);
  const attentionPoints = getScoreAttentionPoints(scoreExplanation);
  const resumeVersion =
    currentAnalysisOverview?.resume_title ??
    overview.resumes.find((resume) => resume.resume_id === currentAnalysisOverview?.resume_id)?.title ??
    "-";
  const analysisDate =
    currentAnalysisOverview?.completed_at ??
    currentAnalysisOverview?.updated_at ??
    rankingEntry?.source_analysis_created_at ??
    rankingEntry?.computed_at ??
    null;
  const summary = scoreExplanation?.ranking_summary_text ?? rankingEntry?.ranking_summary_text ?? null;

  return (
    <div className="space-y-4">
      {scoreStatus === "score_stale" ? (
        <SectionCard title="Score desatualizado">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-muted">
              O score atual pode não refletir a versão mais recente do currículo ou da vaga.
            </p>
            <ActionButton
              onClick={() => void onRequestAnalysis({ force: true })}
              disabled={analysisRequesting}
              primary
            >
              {analysisRequesting ? "Atualizando..." : "Atualizar análise"}
            </ActionButton>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard title="Análise da vaga ativa">
        <DefinitionList
          items={[
            ["Score principal", formatScorePercent(rankingEntry?.job_fit_score ?? decision?.match_score ?? null)],
            ["Status da análise", status ? (ANALYSIS_STATUS_LABEL[status] ?? status) : "-"],
            ["Data da análise", analysisDate ? formatDateTime(analysisDate) : "-"],
            ["Currículo analisado", resumeVersion],
          ]}
        />
      </SectionCard>

      {summary || strengths.length > 0 || attentionPoints.length > 0 || scoreExplanationLoading ? (
        <SectionCard title="Explicação resumida">
          {scoreExplanationLoading ? (
            <p className="text-sm text-text-muted">Carregando explicação detalhada...</p>
          ) : null}
          {summary ? <p className="text-sm leading-6 text-text">{summary}</p> : null}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <InsightColumn title="Principais forças" items={strengths} empty="Sem forças destacadas." />
            <InsightColumn title="Pontos de atenção" items={attentionPoints} empty="Sem pontos de atenção destacados." />
          </div>
        </SectionCard>
      ) : null}

      <CandidateScoreDetailsTab
        overview={overview}
        activeJobId={activeJobId}
        activeJob={activeJob}
        activePipelineEntry={activePipelineEntry}
        rankingEntry={rankingEntry}
        analysisResult={analysisResult}
        loading={loading}
        error={error}
        compatibilityGuidance={compatibilityGuidance}
        scoreExplanation={scoreExplanation}
      />
    </div>
  );
}

function InsightColumn({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-text">
          {items.map((item) => (
            <li key={item} className="rounded-xl border border-[hsl(var(--border)/0.65)] bg-[hsl(var(--bg))] px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">{empty}</p>
      )}
    </div>
  );
}

function ProfileDocumentsTab({
  overview,
  onReload,
}: {
  overview: CandidateOverview;
  onReload: () => Promise<void>;
}) {
  const { user } = useAuth();
  const resumes = overview.resumes ?? [];
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [resumesById, setResumesById] = useState<Record<string, Resume>>({});
  const [resumesLoading, setResumesLoading] = useState(false);
  const [resumesError, setResumesError] = useState<string | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const canDownload = user?.role === "admin" || user?.role === "recruiter";
  const currentResumeSummary = useMemo(() => {
    if (resumes.length === 0) return null;
    return resumes.find((resume) => resume.status === "active") ?? resumes[0];
  }, [resumes]);
  const selectedResumeSummary = useMemo(() => {
    if (!selectedResumeId) return currentResumeSummary;
    return resumes.find((resume) => resume.resume_id === selectedResumeId) ?? currentResumeSummary;
  }, [currentResumeSummary, resumes, selectedResumeId]);
  const selectedResumeDetails = selectedResumeSummary
    ? resumesById[selectedResumeSummary.resume_id] ?? null
    : null;
  const selectedVersion = useMemo<ResumeVersion | null>(() => {
    if (!selectedResumeDetails) return null;
    if (selectedVersionId) {
      return selectedResumeDetails.versions.find((version) => version.id === selectedVersionId) ?? null;
    }
    const fallbackVersionId = selectedResumeSummary?.current_version_id;
    if (fallbackVersionId) {
      return selectedResumeDetails.versions.find((version) => version.id === fallbackVersionId) ?? null;
    }
    return selectedResumeDetails.versions[0] ?? null;
  }, [selectedResumeDetails, selectedResumeSummary, selectedVersionId]);

  useEffect(() => {
    setSelectedResumeId(currentResumeSummary?.resume_id ?? null);
  }, [currentResumeSummary?.resume_id]);

  useEffect(() => {
    setSelectedVersionId(selectedResumeSummary?.current_version_id ?? null);
  }, [selectedResumeSummary?.resume_id, selectedResumeSummary?.current_version_id]);

  useEffect(() => {
    let cancelled = false;
    if (resumes.length === 0) {
      setResumesById({});
      setResumesError(null);
      return () => {
        cancelled = true;
      };
    }

    setResumesLoading(true);
    setResumesError(null);
    void Promise.all(resumes.map((resume) => resumeService.get(resume.resume_id)))
      .then((items) => {
        if (cancelled) return;
        const next: Record<string, Resume> = {};
        for (const item of items) next[item.id] = item;
        setResumesById(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResumesError(
          formatContextError(
            err,
            "Não foi possível carregar metadados do currículo.",
            "Tente novamente em instantes.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setResumesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resumes]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [previewObjectUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const created = await resumeService.initiateUpload(overview.candidate.id);
      await resumeService.uploadPdf(created.resume_id, file);
      setFile(null);
      toast.success("Currículo enviado.");
      await onReload();
    } catch (err: unknown) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível enviar o currículo.",
          "Verifique o PDF e tente novamente.",
        ),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedResumeSummary) return;
    setDownloading(true);
    try {
      await resumeService.downloadCandidateResume(
        overview.candidate.id,
        selectedResumeSummary.resume_id,
        { versionId: selectedVersion?.id ?? selectedResumeSummary.current_version_id },
      );
    } catch (err: unknown) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível baixar o currículo.",
          "Confirme se há um arquivo enviado para este candidato.",
        ),
      );
    } finally {
      setDownloading(false);
    }
  };

  const canPreviewInline = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    if (mimeType === "application/pdf") return true;
    return mimeType.startsWith("image/");
  };

  const isDocFormat = (mimeType: string | null, fileName: string | null): boolean => {
    const lowerName = (fileName ?? "").toLowerCase();
    if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) return true;
    return (
      mimeType === "application/msword" ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  };

  const handlePreview = async () => {
    if (!selectedResumeSummary) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const payload = await resumeService.fetchCandidateResumeFile(
        overview.candidate.id,
        selectedResumeSummary.resume_id,
        {
          versionId: selectedVersion?.id ?? selectedResumeSummary.current_version_id,
          disposition: "inline",
        },
      );
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      const objectUrl = URL.createObjectURL(payload.blob);
      setPreviewObjectUrl(objectUrl);
      setPreviewFileName(payload.filename);
      setPreviewContentType(payload.contentType);
    } catch (err: unknown) {
      setPreviewError(
        formatContextError(
          err,
          "Não foi possível carregar o currículo.",
          "Tente novamente ou faça o download do arquivo.",
        ),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenInNewTab = async () => {
    if (!selectedResumeSummary) return;
    try {
      const payload = await resumeService.fetchCandidateResumeFile(
        overview.candidate.id,
        selectedResumeSummary.resume_id,
        {
          versionId: selectedVersion?.id ?? selectedResumeSummary.current_version_id,
          disposition: "inline",
        },
      );
      const objectUrl = URL.createObjectURL(payload.blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err: unknown) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível abrir o currículo em nova aba.",
          "Tente novamente.",
        ),
      );
    }
  };

  const selectedFileName =
    selectedVersion?.original_file_name ?? selectedResumeSummary?.current_file_name ?? null;
  const selectedMimeType = selectedVersion?.mime_type ?? previewContentType ?? null;
  const showInlinePreview = canPreviewInline(selectedMimeType);
  const showDocFallback = isDocFormat(selectedMimeType, selectedFileName);

  return (
    <div className="space-y-4">
      <SectionCard title="Enviar currículo">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <ActionButton onClick={() => void handleUpload()} disabled={!file || uploading} primary>
            {uploading ? "Enviando..." : "Enviar currículo"}
          </ActionButton>
          {canDownload && selectedResumeSummary?.current_version_id ? (
            <ActionButton onClick={() => void handleDownload()} disabled={downloading}>
              {downloading ? "Baixando..." : "Baixar currículo"}
            </ActionButton>
          ) : null}
        </div>
        {file ? (
          <p className="mt-2 text-xs text-text-muted">
            Selecionado: {file.name}
          </p>
        ) : null}
      </SectionCard>

      {resumes.length === 0 ? (
        <EmptyBlock
          title="Nenhum currículo enviado"
          description="Quando um currículo for enviado pelo candidato ou pelo recrutador, ele aparecerá aqui."
        />
      ) : (
        <>
          <SectionCard title="Currículo atual">
            {selectedResumeSummary ? (
              <div className="space-y-4">
                <DefinitionList
                  items={[
                    ["Arquivo", selectedFileName ?? "Sem arquivo"],
                    ["Tipo", selectedMimeType ?? "Não informado"],
                    [
                      "Data de envio",
                      selectedVersion
                        ? formatDateTime(selectedVersion.uploaded_at)
                        : formatDateTime(selectedResumeSummary.updated_at),
                    ],
                    [
                      "Status de extração",
                      selectedVersion?.extraction_status ?? selectedResumeSummary.extraction_status ?? "-",
                    ],
                    ["Versão atual", `v${selectedResumeSummary.current_version}`],
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={() => void handlePreview()} disabled={previewLoading}>
                    {previewLoading ? "Carregando..." : "Visualizar currículo"}
                  </ActionButton>
                  {canDownload ? (
                    <ActionButton onClick={() => void handleDownload()} disabled={downloading}>
                      {downloading ? "Baixando..." : "Baixar"}
                    </ActionButton>
                  ) : null}
                  <ActionButton onClick={() => void handleOpenInNewTab()}>
                    Abrir em nova aba
                  </ActionButton>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Nenhum currículo enviado.</p>
            )}
          </SectionCard>

          <SectionCard title="Visualização do currículo">
            {previewLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-56 animate-pulse rounded bg-surface-muted" />
                <div className="h-72 animate-pulse rounded-xl border border-[hsl(var(--border)/0.7)] bg-surface-muted" />
              </div>
            ) : null}
            {!previewLoading && previewError ? (
              <p className="text-sm text-danger">Não foi possível carregar o currículo.</p>
            ) : null}
            {!previewLoading && !previewError && !previewObjectUrl ? (
              <p className="text-sm text-text-muted">
                Clique em "Visualizar currículo" para abrir o arquivo.
              </p>
            ) : null}
            {!previewLoading && !previewError && previewObjectUrl && showInlinePreview ? (
              selectedMimeType?.startsWith("image/") ? (
                <img
                  src={previewObjectUrl}
                  alt={previewFileName ?? "Preview do currículo"}
                  className="max-h-[70vh] w-full rounded-xl border border-[hsl(var(--border)/0.7)] object-contain"
                />
              ) : (
                <iframe
                  title={previewFileName ?? "Preview do currículo"}
                  src={previewObjectUrl}
                  className="h-[70vh] w-full rounded-xl border border-[hsl(var(--border)/0.7)]"
                />
              )
            ) : null}
            {!previewLoading && !previewError && previewObjectUrl && !showInlinePreview && showDocFallback ? (
              <p className="text-sm text-text-muted">
                Pré-visualização indisponível para este formato. Baixe o arquivo para visualizar.
              </p>
            ) : null}
            {!previewLoading && !previewError && previewObjectUrl && !showInlinePreview && !showDocFallback ? (
              <p className="text-sm text-text-muted">
                Não foi possível renderizar este tipo de arquivo no navegador. Use "Baixar" ou "Abrir em nova aba".
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Versões do currículo">
            {resumesLoading ? (
              <div className="h-16 animate-pulse rounded-xl border border-[hsl(var(--border)/0.7)] bg-surface-muted" />
            ) : null}
            {!resumesLoading && resumesError ? (
              <p className="text-sm text-danger">{resumesError}</p>
            ) : null}
            {!resumesLoading && !resumesError && selectedResumeDetails?.versions.length ? (
              <ul className="space-y-2">
                {selectedResumeDetails.versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--bg))] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-text">
                        v{version.version_number} · {version.original_file_name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatDateTime(version.uploaded_at)} · {version.mime_type}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedVersionId(version.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-muted"
                    >
                      {selectedVersion?.id === version.id ? "Selecionada" : "Visualizar"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function ProfileInterviewsTab({
  jobId,
  candidateId,
  previewPendencies,
  hasTechnicalInterviewPendency,
  focusToken,
  scheduleTechnicalFocusToken,
  focusInterviewId,
  onAfterInterviewChange,
  onOpenHistory,
}: {
  jobId: string | null;
  candidateId: string | null;
  previewPendencies: CandidatePreviewPendencyOverview[];
  hasTechnicalInterviewPendency?: boolean;
  focusToken: number;
  scheduleTechnicalFocusToken?: number;
  focusInterviewId: string | null;
  onAfterInterviewChange: () => void | Promise<void>;
  onOpenHistory: () => void;
}) {
  const [items, setItems] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "reschedule" | null>(null);
  const [editing, setEditing] = useState<InterviewSchedule | null>(null);
  const [scorecardInterviewId, setScorecardInterviewId] = useState<string | null>(null);
  const [feedbackInterviewId, setFeedbackInterviewId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [detailsInterviewId, setDetailsInterviewId] = useState<string | null>(null);
  const [highlightedInterviewId, setHighlightedInterviewId] = useState<string | null>(null);
  const interviewRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const autoOpenedScorecardRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    title: "Entrevista com candidato",
    interview_type: "hr" as InterviewType,
    interview_format: "online" as InterviewFormat,
    scheduled_start: "",
    scheduled_end: "",
    interviewer_name: "",
    interviewer_email: "",
    location: "",
    meeting_url: "",
  });

  const canUseFlow = Boolean(jobId && candidateId);
  const scorecardGatePayload = useMemo(
    () =>
      previewPendencies.find((pendency) => pendency.id === "scorecard_not_submitted")?.action_payload ??
      null,
    [previewPendencies],
  );
  const scorecardGateInterviewId = useMemo(() => {
    const raw = scorecardGatePayload?.interview_id;
    return typeof raw === "string" && raw ? raw : null;
  }, [scorecardGatePayload]);
  const hasScorecardGatePendency = previewPendencies.some((pendency) => pendency.id === "scorecard_not_submitted");

  const load = useCallback(async () => {
    if (!jobId || !candidateId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await agendaService.listCandidateJobInterviews(jobId, candidateId, {
        page: 1,
        page_size: 20,
      });
      setItems(payload.data);
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível carregar entrevistas.",
          "Tente novamente em alguns instantes.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [candidateId, jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusToken <= 0 || items.length === 0) return;
    const target =
      (focusInterviewId ? items.find((item) => item.id === focusInterviewId) : null) ??
      (scorecardGateInterviewId ? items.find((item) => item.id === scorecardGateInterviewId) : null) ??
      items.find((item) => item.counts_for_current_gate) ??
      items[0];
    const canOpenScorecard = target.status === "completed" || target.status === "awaiting_feedback";
    if (canOpenScorecard) {
      setScorecardInterviewId(target.id);
    }
    setHighlightedInterviewId(target.id);
    window.setTimeout(() => {
      interviewRefs.current[target.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    const timeout = window.setTimeout(() => setHighlightedInterviewId(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [focusInterviewId, focusToken, items, scorecardGateInterviewId]);

  useEffect(() => {
    if (!scorecardGateInterviewId || items.length === 0) return;
    if (autoOpenedScorecardRef.current === scorecardGateInterviewId) return;
    const target = items.find((item) => item.id === scorecardGateInterviewId);
    if (!target || target.scorecard_status === "submitted") return;
    if (target.status !== "completed" && target.status !== "awaiting_feedback") return;
    autoOpenedScorecardRef.current = scorecardGateInterviewId;
    setScorecardInterviewId(target.id);
  }, [items, scorecardGateInterviewId]);

  useEffect(() => {
    if (scheduleTechnicalFocusToken && scheduleTechnicalFocusToken > 0) {
      openForm("technical");
    }
  }, [scheduleTechnicalFocusToken]);

  const openForm = (initialType: InterviewType = "hr") => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setMinutes(0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    setForm({
      title: initialType === "technical" ? "Agendar entrevista técnica" : "Entrevista com candidato",
      interview_type: initialType,
      interview_format: "online",
      scheduled_start: toDatetimeLocal(start.toISOString()),
      scheduled_end: toDatetimeLocal(end.toISOString()),
      interviewer_name: "",
      interviewer_email: "",
      location: "",
      meeting_url: "",
    });
    setEditing(null);
    setFormMode("create");
  };

  const openReschedule = (interview: InterviewSchedule) => {
    setEditing(interview);
    setForm({
      title: interview.title,
      interview_type: interview.interview_type,
      interview_format: interview.interview_format,
      scheduled_start: toDatetimeLocal(interview.scheduled_start),
      scheduled_end: toDatetimeLocal(interview.scheduled_end),
      interviewer_name: interview.interviewer_name ?? "",
      interviewer_email: interview.interviewer_email ?? "",
      location: interview.location ?? "",
      meeting_url: interview.meeting_url ?? "",
    });
    setFormMode("reschedule");
  };

  const openFeedback = (interview: InterviewSchedule) => {
    setScorecardInterviewId(null);
    setFeedbackInterviewId((current) => {
      if (current === interview.id) {
        setFeedbackDraft("");
        return null;
      }
      setFeedbackDraft(interview.internal_notes ?? "");
      return interview.id;
    });
  };

  const submit = async () => {
    if (!jobId || !candidateId || !form.scheduled_start || !form.scheduled_end) return;

    setSaving(true);
    setError(null);
    try {
      if (formMode === "reschedule" && editing) {
        await agendaService.rescheduleInterview(editing.id, {
          scheduled_start: fromDatetimeLocal(form.scheduled_start),
          scheduled_end: fromDatetimeLocal(form.scheduled_end),
          timezone: "America/Recife",
          location: form.location || null,
          meeting_url: form.meeting_url || null,
          interviewer_name: form.interviewer_name || null,
          interviewer_email: form.interviewer_email || null,
        });
        toast.success("Entrevista reagendada.");
      } else {
        await agendaService.createCandidateJobInterview(jobId, candidateId, {
          title: form.title,
          interview_type: form.interview_type,
          interview_format: form.interview_format,
          status: "scheduled",
          scheduled_start: fromDatetimeLocal(form.scheduled_start),
          scheduled_end: fromDatetimeLocal(form.scheduled_end),
          timezone: "America/Recife",
          location: form.location || null,
          meeting_url: form.meeting_url || null,
          interviewer_name: form.interviewer_name || null,
          interviewer_email: form.interviewer_email || null,
        });
        toast.success("Entrevista agendada.");
      }
      setFormMode(null);
      setEditing(null);
      await load();
      await onAfterInterviewChange();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível salvar a entrevista.",
          "Revise data, horário e vínculo com a vaga.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    action: () => Promise<InterviewSchedule>,
    successMessage: string,
  ) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      toast.success(successMessage);
      await load();
      await onAfterInterviewChange();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível aplicar a ação.",
          "Tente novamente ou revise o status atual da entrevista.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleScorecardSubmitted = async () => {
    await load();
    await onAfterInterviewChange();
  };

  const handleScorecardChanged = async () => {
    await load();
    await onAfterInterviewChange();
  };

  const saveFeedback = async (interview: InterviewSchedule) => {
    setSaving(true);
    setError(null);
    try {
      await agendaService.completeInterview(interview.id, {
        internal_notes: feedbackDraft.trim() || null,
      });
      toast.success("Feedback da entrevista salvo.");
      setFeedbackInterviewId(null);
      setFeedbackDraft("");
      await load();
      await onAfterInterviewChange();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível registrar o feedback.",
          "Tente novamente ou revise o status atual da entrevista.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canUseFlow) {
    return (
      <EmptyBlock
        title="Candidato sem vaga ativa"
        description="Vincule o candidato a uma vaga para agendar entrevistas."
      />
    );
  }

  return (
    <div className="space-y-4">
      <CurrentProcessHistoryHint
        candidateId={candidateId}
        jobId={jobId}
        onOpenHistory={onOpenHistory}
      />
      <SectionCard title="Entrevistas">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            Agenda operacional do processo atual nesta vaga. Entrevistas de ciclos anteriores ficam no histórico.
          </p>
          <ActionButton onClick={() => openForm()} primary>
            <CalendarPlus className="h-4 w-4" />
            Agendar entrevista
          </ActionButton>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {formMode ? (
          <div className="mt-4 rounded-xl border border-border bg-[hsl(var(--bg))] p-4">
            <p className="mb-3 text-sm font-bold text-text">
              {formMode === "reschedule" ? "Reagendar entrevista" : form.title}
            </p>
            {hasTechnicalInterviewPendency && formMode === "create" && (
              <p className="mb-4 text-sm font-semibold text-[hsl(var(--primary))]">
                Esta entrevista é necessária para avançar o candidato.
              </p>
            )}
            {hasTechnicalInterviewPendency && formMode === "create" && form.interview_type !== "technical" && (
              <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Atenção: uma entrevista de RH não resolverá a pendência técnica.
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="font-semibold text-text">Título</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  disabled={formMode === "reschedule"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Tipo</span>
                <select
                  value={form.interview_type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, interview_type: event.target.value as InterviewType }))
                  }
                  disabled={formMode === "reschedule"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {Object.entries(INTERVIEW_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Formato</span>
                <select
                  value={form.interview_format}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, interview_format: event.target.value as InterviewFormat }))
                  }
                  disabled={formMode === "reschedule"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  <option value="online">Online</option>
                  <option value="presencial">Presencial</option>
                  <option value="telefone">Telefone</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Entrevistador</span>
                <input
                  value={form.interviewer_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, interviewer_name: event.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">E-mail do entrevistador</span>
                <input
                  type="email"
                  value={form.interviewer_email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, interviewer_email: event.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Início</span>
                <input
                  type="datetime-local"
                  value={form.scheduled_start}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduled_start: event.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Fim</span>
                <input
                  type="datetime-local"
                  value={form.scheduled_end}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduled_end: event.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Local</span>
                <input
                  value={form.location}
                  onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-semibold text-text">Link da reunião</span>
                <input
                  value={form.meeting_url}
                  onChange={(event) => setForm((current) => ({ ...current, meeting_url: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton onClick={() => void submit()} disabled={saving} primary>
                {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {formMode === "reschedule" ? "Salvar reagendamento" : "Salvar entrevista"}
              </ActionButton>
              <ActionButton
                onClick={() => {
                  setFormMode(null);
                  setEditing(null);
                }}
                disabled={saving}
              >
                <X className="h-4 w-4" />
                Cancelar
              </ActionButton>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Entrevistas do processo atual">
        {loading ? (
          <p className="text-sm text-text-muted">Carregando entrevistas...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma entrevista registrada no processo atual.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const isScheduled = item.status === "scheduled" || item.status === "rescheduled";
              const canScorecard = item.status === "completed" || item.status === "awaiting_feedback";
              const isTerminal = item.status === "cancelled" || item.status === "no_show";
              const detailsOpen = detailsInterviewId === item.id;
              const isScorecardGateInterview =
                item.id === scorecardGateInterviewId ||
                (!scorecardGateInterviewId &&
                  hasScorecardGatePendency &&
                  item.counts_for_current_gate &&
                  item.status !== "cancelled" &&
                  item.status !== "no_show");
              const needsScorecardForGate =
                isScorecardGateInterview && item.scorecard_status !== "submitted";
              const scorecardOpen = scorecardInterviewId === item.id;
              const feedbackOpen = feedbackInterviewId === item.id;
              return (
                <li
                  key={item.id}
                  ref={(node) => {
                    interviewRefs.current[item.id] = node;
                  }}
                  className={[
                    "rounded-xl border bg-[hsl(var(--bg))] p-4 transition",
                    highlightedInterviewId === item.id
                      ? "border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary)/0.20)]"
                      : item.counts_for_current_gate || needsScorecardForGate
                      ? "border-[hsl(var(--primary)/0.35)]"
                      : "border-[hsl(var(--border)/0.7)]",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={item.counts_for_current_gate ? "primary" : "neutral"}>
                          {item.counts_for_current_gate ? "Conta para o gate atual" : "Não conta para o gate técnico"}
                        </Badge>
                        <Badge tone="info">{interviewTypeLabel(item.interview_type)}</Badge>
                        <Badge tone={item.status === "completed" ? "success" : item.status === "cancelled" || item.status === "no_show" ? "danger" : "neutral"}>
                          {interviewStatusLabel(item.status)}
                        </Badge>
                      </div>
                      <p className="mt-3 font-semibold text-text">{item.title}</p>
                      <div className="mt-2 grid gap-2 text-sm text-text-muted md:grid-cols-2">
                        <span className="inline-flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {formatInterviewDateTime(item.scheduled_start)}
                        </span>
                        <span>Formato: {interviewFormatLabel(item.interview_format)}</span>
                        <span>Entrevistador: {item.interviewer_name || item.interviewer_email || "não definido"}</span>
                        <span>Scorecard: {scorecardStatusLabel(item)}</span>
                      </div>
                      {item.counts_for_current_gate ? (
                        <p className="mt-3 rounded-lg border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.06)] px-3 py-2 text-sm font-medium text-text">
                          Esta entrevista é necessária para avançar o candidato.
                        </p>
                      ) : null}
                      {needsScorecardForGate ? (
                        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                          Esta entrevista precisa de scorecard para avançar.
                        </p>
                      ) : null}
                      {isScheduled && (item.counts_for_current_gate || isScorecardGateInterview) ? (
                        <p className="mt-3 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-sm text-text-muted">
                          A entrevista precisa ser concluída antes do scorecard.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                      {isScheduled ? (
                        <>
                          <ActionButton onClick={() => openReschedule(item)} disabled={saving}>
                            <Pencil className="h-4 w-4" />
                            Reagendar
                          </ActionButton>
                          <ActionButton
                            onClick={() =>
                              void runAction(
                                () => agendaService.cancelInterviewOperational(item.id, { cancel_reason: "Cancelada pelo recrutador." }),
                                "Entrevista cancelada.",
                              )
                            }
                            disabled={saving}
                          >
                            <X className="h-4 w-4" />
                            Cancelar
                          </ActionButton>
                          <ActionButton
                            onClick={() =>
                              void runAction(
                                () => agendaService.completeInterview(item.id),
                                "Entrevista marcada como concluída.",
                              )
                            }
                            disabled={saving}
                            primary
                          >
                            <Check className="h-4 w-4" />
                            Marcar como concluída
                          </ActionButton>
                          <ActionButton
                            onClick={() =>
                              void runAction(
                                () => agendaService.markNoShow(item.id, { reason: "Candidato não compareceu." }),
                                "Entrevista marcada como não comparecimento.",
                              )
                            }
                            disabled={saving}
                          >
                            <UserX className="h-4 w-4" />
                            Não compareceu
                          </ActionButton>
                        </>
                      ) : null}

                      {canScorecard ? (
                        <>
                          <ActionButton
                            onClick={() => openFeedback(item)}
                            disabled={saving}
                          >
                            <NotebookPen className="h-4 w-4" />
                            Registrar feedback
                          </ActionButton>
	                          <ActionButton
	                            onClick={() => {
	                              setFeedbackInterviewId(null);
	                              setFeedbackDraft("");
	                              setScorecardInterviewId((current) => (current === item.id ? null : item.id));
	                            }}
	                            disabled={saving}
	                            primary
	                          >
                            <ClipboardCheck className="h-4 w-4" />
                            {scorecardActionLabel(item)}
                          </ActionButton>
                        </>
                      ) : null}

                      {isTerminal ? (
                        <>
                          <ActionButton onClick={() => openReschedule(item)} disabled={saving}>
                            <Pencil className="h-4 w-4" />
                            Reagendar
                          </ActionButton>
                          <ActionButton
                            onClick={() => setDetailsInterviewId((current) => (current === item.id ? null : item.id))}
                            disabled={saving}
                          >
                            Ver detalhes
                          </ActionButton>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {detailsOpen ? (
                    <div className="mt-4 rounded-lg border border-border bg-surface p-3 text-sm text-text-muted">
                      <p>Status: {interviewStatusLabel(item.status)}</p>
                      {item.cancel_reason ? <p>Motivo: {item.cancel_reason}</p> : null}
                      {item.internal_notes ? <p>Observações internas: {item.internal_notes}</p> : null}
                    </div>
                  ) : null}

                  {feedbackOpen ? (
                    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                      <label className="block text-sm">
                        <span className="font-semibold text-text">Feedback da entrevista</span>
                        <textarea
                          value={feedbackDraft}
                          onChange={(event) => setFeedbackDraft(event.target.value)}
                          rows={4}
                          className="mt-2 w-full resize-none rounded-lg border border-border bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton onClick={() => void saveFeedback(item)} disabled={saving} primary>
                          {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Salvar feedback
                        </ActionButton>
                        <ActionButton
                          onClick={() => {
                            setFeedbackInterviewId(null);
                            setFeedbackDraft("");
                          }}
                          disabled={saving}
                        >
                          <X className="h-4 w-4" />
                          Cancelar
                        </ActionButton>
                      </div>
                    </div>
                  ) : null}

                  {scorecardOpen && canScorecard ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-bold text-text">
                            {item.scorecard_status === "submitted" ? "Scorecard enviado" : "Scorecard da entrevista"}
                          </p>
                          <p className="text-xs text-text-muted">
                            {interviewTypeLabel(item.interview_type)} · {formatInterviewDateTime(item.scheduled_start)}
                          </p>
                        </div>
                        <ActionButton onClick={() => setScorecardInterviewId(null)}>
                          <X className="h-4 w-4" />
                          Fechar
                        </ActionButton>
                      </div>
	                      <InterviewScorecardPanel
	                        jobId={jobId}
	                        candidateId={candidateId}
	                        interviewId={item.id}
	                        onChanged={handleScorecardChanged}
	                        onSubmitted={handleScorecardSubmitted}
	                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

const BEHAVIORAL_STATUS_LABEL: Record<BehavioralAssignmentDetailResponse["status"], string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  submitted: "Concluído",
  expired: "Expirado",
  cancelled: "Cancelado",
};

function behavioralStatusTone(status: BehavioralAssignmentDetailResponse["status"]) {
  if (status === "submitted") return "success";
  if (status === "expired" || status === "cancelled") return "danger";
  if (status === "in_progress") return "info";
  return "neutral";
}

function behavioralKindLabel(assessment: BehavioralAssignmentDetailResponse, required: boolean) {
  const templateName = assessment.template_name.toLowerCase();
  if (templateName.includes("pesquisa")) return "Pesquisa comportamental";
  if (templateName.includes("teste")) return "Teste comportamental";
  return required ? "Teste comportamental" : "Pesquisa comportamental";
}

function renderBehavioralAnswer(answer: BehavioralAssignmentAnswer | null) {
  if (!answer) return <span className="text-text-muted">Não respondida</span>;
  if (answer.answer_text) return <p className="whitespace-pre-wrap">{answer.answer_text}</p>;
  if (answer.answer_value !== null && answer.answer_value !== undefined) {
    return <span className="font-semibold">{answer.answer_value}</span>;
  }
  if (answer.selected_options_json?.length) {
    return <span>{answer.selected_options_json.join(", ")}</span>;
  }
  return <span className="text-text-muted">Não respondida</span>;
}

function getBehavioralAIStatusLabel(
  assignmentStatus: BehavioralAssignmentDetailResponse["status"],
  evaluation: BehavioralAIEvaluationResponse | null,
) {
  if (assignmentStatus !== "submitted") return "Aguardando teste";
  if (!evaluation) return "Pendente";
  if (evaluation.status === "pending") return "Na fila";
  if (evaluation.status === "processing") return "Processando";
  if (evaluation.status === "retry_scheduled") return "Retry agendado";
  if (evaluation.status === "completed") return "Concluída";
  if (evaluation.status === "failed") return "Falhou";
  return evaluation.status;
}

function getBehavioralAIStatusTone(
  assignmentStatus: BehavioralAssignmentDetailResponse["status"],
  evaluation: BehavioralAIEvaluationResponse | null,
): "success" | "neutral" | "info" | "primary" | "danger" {
  if (assignmentStatus !== "submitted") return "neutral";
  if (!evaluation) return "info";
  if (evaluation.status === "completed") return "success";
  if (evaluation.status === "failed") return "danger";
  if (evaluation.status === "pending" || evaluation.status === "processing" || evaluation.status === "retry_scheduled") return "info";
  return "neutral";
}

function ProfileBehavioralAssessmentsTab({
  jobId,
  candidateId,
  required,
  requiresAI,
  focusToken,
  onAfterBehavioralAIRequest,
  onOpenHistory,
}: {
  jobId: string | null;
  candidateId: string | null;
  required: boolean;
  requiresAI: boolean;
  focusToken: number;
  onAfterBehavioralAIRequest: () => Promise<void>;
  onOpenHistory: () => void;
}) {
  const [assessment, setAssessment] = useState<BehavioralAssignmentDetailResponse | null>(null);
  const [evaluation, setEvaluation] = useState<BehavioralAIEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiRequesting, setAiRequesting] = useState(false);
  const [aiActionError, setAiActionError] = useState<string | null>(null);
  const aiActionRef = useRef<HTMLDivElement | null>(null);

  const loadBehavioralAssessment = useCallback(async () => {
    if (!jobId || !candidateId) {
      setAssessment(null);
      setEvaluation(null);
      return;
    }

    setLoading(true);
    setError(null);
    setAiActionError(null);

    try {
      const payload = await getCandidateBehavioralAssessment(jobId, candidateId);
      setAssessment(payload?.template_name ? payload : null);

      if (payload?.status === "submitted") {
        const summary = await getBehavioralEvaluation(jobId, candidateId);
        setEvaluation(summary);
      } else {
        setEvaluation(null);
      }
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível carregar avaliações comportamentais.",
          "Tente novamente em alguns instantes.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [candidateId, jobId]);

  useEffect(() => {
    let cancelled = false;
    void loadBehavioralAssessment().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadBehavioralAssessment]);

  useEffect(() => {
    if (
      evaluation?.status !== "pending" &&
      evaluation?.status !== "processing" &&
      evaluation?.status !== "retry_scheduled"
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void loadBehavioralAssessment();
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [evaluation?.status, loadBehavioralAssessment]);

  const [highlightingAI, setHighlightingAI] = useState(false);
  useEffect(() => {
    if (focusToken <= 0) return;
    window.setTimeout(() => {
      if (typeof aiActionRef.current?.scrollIntoView === "function") {
        aiActionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      aiActionRef.current?.focus({ preventScroll: true });
    }, 0);
    setHighlightingAI(true);
    const clearId = window.setTimeout(() => setHighlightingAI(false), 3000);
    return () => window.clearTimeout(clearId);
  }, [focusToken]);

  const handleGenerateBehavioralAI = useCallback(async () => {
    if (!jobId || !candidateId || aiRequesting) return;

    setAiRequesting(true);
    setAiActionError(null);
    try {
      const response = await triggerBehavioralAnalysis(jobId, candidateId, {
        retryFailed: evaluation?.status === "failed",
      });
      setEvaluation({
        id: response.evaluation_id,
        assignment_id: response.assignment_id || assessment?.id || "",
        status: response.status,
        confidence: null,
        summary: null,
        strengths: null,
        concerns: null,
        competency_signals: null,
        suggested_interview_questions: null,
        risk_flags: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      });
      await Promise.all([loadBehavioralAssessment(), onAfterBehavioralAIRequest()]);
    } catch (err: unknown) {
      setAiActionError(
        formatContextError(
          err,
          "Não foi possível solicitar a IA comportamental.",
          "Tente novamente em alguns instantes.",
        ),
      );
    } finally {
      setAiRequesting(false);
    }
  }, [
    aiRequesting,
    assessment?.id,
    candidateId,
    evaluation?.status,
    jobId,
    loadBehavioralAssessment,
    onAfterBehavioralAIRequest,
  ]);

  if (!jobId || !candidateId) {
    return (
      <EmptyBlock
        title="Candidato sem vaga ativa"
        description="Vincule o candidato a uma vaga para consultar avaliações comportamentais."
      />
    );
  }

  if (loading) {
    return <p className="text-sm text-text-muted">Carregando avaliações...</p>;
  }

  if (error) {
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </p>
    );
  }

  if (!assessment) {
    return (
      <EmptyBlock
        title="Nenhuma avaliação comportamental"
        description="Quando houver teste ou pesquisa comportamental vinculada a esta candidatura, ela aparecerá aqui."
      />
    );
  }

  const answeredLabel = `${assessment.answered_count} de ${assessment.question_count} respostas`;
  const kindLabel = behavioralKindLabel(assessment, required);
  const showAIStatus = requiresAI || evaluation !== null || assessment.status === "submitted";
  const aiStatusLabel = getBehavioralAIStatusLabel(assessment.status, evaluation);
  const aiStatusTone = getBehavioralAIStatusTone(assessment.status, evaluation);
  const canRequestAI = assessment.status === "submitted" && (!evaluation || evaluation.status === "failed");

  return (
    <div className="space-y-4">
      <CurrentProcessHistoryHint
        candidateId={candidateId}
        jobId={jobId}
        onOpenHistory={onOpenHistory}
      />
      <SectionCard title="Avaliação comportamental">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-muted">{kindLabel}</p>
            <h2 className="mt-1 text-lg font-bold text-text">{assessment.template_name}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {assessment.job_title ?? "Vaga atual"} · {answeredLabel}
            </p>
          </div>
          <Badge tone={behavioralStatusTone(assessment.status)}>
            {BEHAVIORAL_STATUS_LABEL[assessment.status] ?? assessment.status}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DefinitionList
            items={[
              ["Obrigatório", required ? "Sim" : "Não"],
              ["Status", BEHAVIORAL_STATUS_LABEL[assessment.status] ?? assessment.status],
              ["Respostas", answeredLabel],
              ["IA comportamental", showAIStatus ? <Badge tone={aiStatusTone}>{aiStatusLabel}</Badge> : "-"],
              ["Início", assessment.started_at ? formatDateTime(assessment.started_at) : "-"],
              ["Conclusão", assessment.submitted_at ? formatDateTime(assessment.submitted_at) : "-"],
            ]}
          />
        </div>
      </SectionCard>

      {showAIStatus ? (
        <SectionCard title="IA comportamental">
          <div
            ref={aiActionRef}
            tabIndex={-1}
            data-testid="behavioral-ai-action-block"
            data-highlighted={highlightingAI ? "true" : undefined}
            className={[
              "rounded-xl border p-4 outline-none transition",
              canRequestAI
                ? "border-amber-200 bg-amber-50"
                : "border-[hsl(var(--border)/0.7)] bg-[hsl(var(--bg))]",
              highlightingAI ? "ring-2 ring-amber-400 ring-offset-2 animate-pulse" : "",
            ].join(" ")}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-text">
                  {evaluation?.status === "failed"
                    ? "IA comportamental falhou"
                    : evaluation?.status === "pending"
                      ? "IA comportamental na fila"
                      : evaluation?.status === "processing"
                        ? "IA comportamental em processamento"
                        : evaluation?.status === "retry_scheduled"
                          ? "IA comportamental com retry agendado"
                      : evaluation?.status === "completed"
                        ? "IA comportamental concluída"
                        : "IA comportamental pendente"}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {!evaluation
                    ? "O candidato concluiu o teste comportamental. Gere a análise com IA para apoiar a decisão."
                    : evaluation.status === "failed"
                      ? "A análise com IA não foi concluída. Tente novamente para gerar uma nova avaliação assistiva."
                      : evaluation.status === "pending"
                        ? "A solicitação foi enviada para a fila de IA comportamental."
                        : evaluation.status === "processing"
                        ? "A solicitação foi enviada e o processamento será atualizado assim que a IA concluir."
                        : evaluation.status === "retry_scheduled"
                          ? `A IA atingiu um limite temporário. Nova tentativa automática${evaluation.next_retry_at ? ` em ${formatDateTime(evaluation.next_retry_at)}` : " agendada"}.`
                        : "A análise assistiva está disponível para apoiar a leitura das respostas comportamentais."}
                </p>
              </div>
              <Badge tone={aiStatusTone}>{aiStatusLabel}</Badge>
            </div>

            {canRequestAI ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <ActionButton
                  onClick={() => void handleGenerateBehavioralAI()}
                  disabled={aiRequesting}
                  primary
                >
                  {aiRequesting ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {aiRequesting
                    ? "Solicitando..."
                    : evaluation?.status === "failed"
                      ? "Tentar novamente"
                      : "Gerar análise IA comportamental"}
                </ActionButton>
                <span className="text-xs text-text-muted">
                  Esta análise não altera score, ranking ou etapa do pipeline.
                </span>
              </div>
            ) : null}

            {aiActionError ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {aiActionError}
              </p>
            ) : null}

            {evaluation?.summary ? (
              <p className="mt-4 whitespace-pre-wrap rounded-lg border border-[hsl(var(--border)/0.6)] bg-surface p-3 text-sm leading-6 text-text">
                {evaluation.summary}
              </p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Respostas">
        {assessment.competencies.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma resposta disponível.</p>
        ) : (
          <div className="space-y-3">
            {assessment.competencies.map((competency) => (
              <details
                key={competency.id}
                className="rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--bg))] p-4"
              >
                <summary className="cursor-pointer text-sm font-bold text-text">
                  {competency.name}
                  <span className="ml-2 font-normal text-text-muted">
                    {competency.questions.length} pergunta(s)
                  </span>
                </summary>
                {competency.description ? (
                  <p className="mt-2 text-xs text-text-muted">{competency.description}</p>
                ) : null}
                <div className="mt-4 space-y-3">
                  {competency.questions.map((question) => {
                    const parsed = parseQuestionText(question.question_text);
                    return (
                      <div
                        key={question.id}
                        className="rounded-xl border border-[hsl(var(--border)/0.5)] bg-surface p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-text">{parsed.text}</p>
                          {question.is_required ? <Badge tone="neutral">Obrigatória</Badge> : null}
                        </div>
                        <div className="mt-2 text-sm text-text">
                          {renderBehavioralAnswer(question.answer)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function CurrentProcessHistoryHint({
  candidateId,
  jobId,
  onOpenHistory,
  className = "",
}: {
  candidateId: string | null;
  jobId: string | null;
  onOpenHistory: () => void;
  className?: string;
}) {
  const [hasPrevious, setHasPrevious] = useState(false);

  useEffect(() => {
    if (!candidateId || !jobId) {
      setHasPrevious(false);
      return;
    }
    let cancelled = false;
    void candidatesService
      .getProcessHistory(candidateId, jobId)
      .then((payload) => {
        if (cancelled) return;
        setHasPrevious(payload.processes.some((process) => !process.is_current));
      })
      .catch(() => {
        if (!cancelled) setHasPrevious(false);
      });
    return () => {
      cancelled = true;
    };
  }, [candidateId, jobId]);

  if (!hasPrevious) return null;

  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`}>
      Este candidato possui processos anteriores nesta vaga.{" "}
      <button
        type="button"
        onClick={onOpenHistory}
        className="font-semibold underline underline-offset-2"
      >
        Ver histórico.
      </button>
    </div>
  );
}

function HistoryTab({
  overview,
  activeJobId,
  focusJobId,
}: {
  overview: CandidateOverview;
  activeJobId: string | null;
  focusJobId: string | null;
}) {
  const [history, setHistory] = useState<CandidateProcessHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void candidatesService
      .getProcessHistory(overview.candidate.id)
      .then((payload) => {
        if (!cancelled) setHistory(payload);
      })
      .catch(() => {
        if (!cancelled) setHistory({ candidate_id: overview.candidate.id, processes: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [overview.candidate.id]);

  const processes = history?.processes ?? [];
  const current = processes.filter((process) => process.is_current);
  const previous = processes
    .filter((process) => !process.is_current)
    .sort((left, right) => {
      if (focusJobId && left.job_id === focusJobId && right.job_id !== focusJobId) return -1;
      if (focusJobId && right.job_id === focusJobId && left.job_id !== focusJobId) return 1;
      return 0;
    });

  const toggle = (pipelineId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(pipelineId)) next.delete(pipelineId);
      else next.add(pipelineId);
      return next;
    });
  };

  if (loading) {
    return <p className="text-sm text-text-muted">Carregando histórico de processos...</p>;
  }

  if (processes.length === 0) {
    return (
      <EmptyBlock
        title="Nenhum processo anterior"
        description="O histórico aparecerá quando o candidato tiver processos encerrados ou ciclos anteriores."
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Processo atual">
        {current.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum processo ativo no momento.</p>
        ) : (
          <div className="space-y-3">
            {current.map((process) => (
              <ProcessHistoryCard
                key={process.pipeline_id}
                process={process}
                expanded={expanded.has(process.pipeline_id)}
                onToggle={() => toggle(process.pipeline_id)}
                activeJobId={activeJobId}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Processos anteriores">
        {previous.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum processo anterior.</p>
        ) : (
          <div className="space-y-3">
            {previous.map((process) => (
              <ProcessHistoryCard
                key={process.pipeline_id}
                process={process}
                expanded={expanded.has(process.pipeline_id)}
                onToggle={() => toggle(process.pipeline_id)}
                activeJobId={activeJobId}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  hr: "Entrevista RH",
  technical: "Entrevista técnica",
  manager: "Entrevista gestor",
  final: "Entrevista final",
  other: "Entrevista",
};

const SIMPLE_STATUS_LABEL: Record<string, string> = {
  scheduled: "agendada",
  rescheduled: "reagendada",
  awaiting_feedback: "aguardando feedback",
  completed: "concluída",
  cancelled: "cancelada",
  no_show: "não compareceu",
  draft: "rascunho",
  submitted: "enviado",
  pending: "pendente",
  in_progress: "em andamento",
  expired: "expirado",
  failed: "falhou",
  processing: "processando",
};

const DECISION_OUTCOME_LABEL: Record<string, string> = {
  advance: "avançar",
  hold: "manter em análise",
  reject: "rejeitar",
  hire: "contratar",
  request_another_interview: "solicitar nova entrevista",
  keep_under_review: "manter em observação",
};

function ProcessHistoryCard({
  process,
  expanded,
  onToggle,
  activeJobId,
}: {
  process: CandidateProcessHistoryItem;
  expanded: boolean;
  onToggle: () => void;
  activeJobId: string | null;
}) {
  const closedAt = process.closed_at ? formatDateTime(process.closed_at) : null;
  const startedAt = process.started_at ? formatDateTime(process.started_at) : null;
  const title = process.is_current
    ? `Processo atual - ${process.job_title}`
    : `Processo anterior encerrado${closedAt ? ` em ${closedAt}` : ""}`;
  const sameActiveJob = activeJobId && process.job_id === activeJobId;

  return (
    <article
      className={[
        "rounded-xl border bg-[hsl(var(--bg))] p-4",
        process.is_current
          ? "border-[hsl(var(--primary)/0.35)]"
          : sameActiveJob
            ? "border-amber-200"
            : "border-[hsl(var(--border)/0.7)]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-text">{title}</h3>
            <Badge tone={process.is_current ? "success" : "neutral"}>
              {process.is_current ? "Atual" : "Histórico"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {process.job_title} · Resultado: {process.result_label} · Última etapa:{" "}
            {STAGE_LABEL[process.current_or_final_stage as PipelineStage] ?? process.current_or_final_stage}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {startedAt ? `Iniciado em ${startedAt}` : "Início não informado"}
            {process.events_count ? ` · ${process.events_count} evento(s)` : ""}
          </p>
        </div>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 transition ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
        <HistorySummaryLine
          label="Entrevistas"
          value={process.interviews.length ? `${process.interviews.length} registrada(s)` : "nenhuma"}
        />
        <HistorySummaryLine
          label="Scorecard"
          value={process.scorecards.some((item) => item.status === "submitted") ? "enviado" : "não enviado"}
        />
        <HistorySummaryLine
          label="Avaliação comportamental"
          value={process.behavioral_assessment ? SIMPLE_STATUS_LABEL[process.behavioral_assessment.status] ?? process.behavioral_assessment.status : "nenhuma"}
        />
        <HistorySummaryLine
          label="Decisão"
          value={process.hiring_decision ? DECISION_OUTCOME_LABEL[process.hiring_decision.outcome] ?? process.hiring_decision.outcome : "nenhuma"}
        />
      </div>

      {process.closure_reason ? (
        <p className="mt-3 rounded-lg border border-[hsl(var(--border)/0.6)] bg-surface px-3 py-2 text-sm text-text-muted">
          Motivo: {process.closure_reason}
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-[hsl(var(--border)/0.7)] pt-4">
          <HistoryDetailList
            title="Entrevistas"
            empty="Nenhuma entrevista registrada neste processo."
            items={process.interviews.map((interview) => ({
              id: interview.id,
              primary: `${INTERVIEW_TYPE_LABEL[interview.type] ?? interview.type}: ${SIMPLE_STATUS_LABEL[interview.status] ?? interview.status}`,
              secondary: [
                interview.scheduled_at ? formatDateTime(interview.scheduled_at) : null,
                interview.scorecard_status
                  ? `Scorecard: ${SIMPLE_STATUS_LABEL[interview.scorecard_status] ?? interview.scorecard_status}`
                  : null,
                interview.final_recommendation ? `Recomendação: ${interview.final_recommendation}` : null,
              ].filter(Boolean).join(" · "),
            }))}
          />
          <HistoryDetailList
            title="Scorecards"
            empty="Nenhum scorecard registrado neste processo."
            items={process.scorecards.map((scorecard) => ({
              id: scorecard.id,
              primary: `Scorecard: ${SIMPLE_STATUS_LABEL[scorecard.status] ?? scorecard.status}`,
              secondary: [
                scorecard.submitted_at ? `Enviado em ${formatDateTime(scorecard.submitted_at)}` : null,
                scorecard.final_recommendation ? `Recomendação: ${scorecard.final_recommendation}` : null,
              ].filter(Boolean).join(" · "),
            }))}
          />
          <HistoryDetailList
            title="Avaliação comportamental"
            empty="Nenhuma avaliação comportamental neste processo."
            items={process.behavioral_assessment ? [{
              id: process.behavioral_assessment.assignment_id,
              primary: `Avaliação: ${SIMPLE_STATUS_LABEL[process.behavioral_assessment.status] ?? process.behavioral_assessment.status}`,
              secondary: [
                process.behavioral_assessment.submitted_at
                  ? `Concluída em ${formatDateTime(process.behavioral_assessment.submitted_at)}`
                  : null,
                process.behavioral_assessment.ai_status
                  ? `IA: ${SIMPLE_STATUS_LABEL[process.behavioral_assessment.ai_status] ?? process.behavioral_assessment.ai_status}`
                  : null,
              ].filter(Boolean).join(" · "),
            }] : []}
          />
          <HistoryDetailList
            title="Decisão"
            empty="Nenhuma decisão registrada neste processo."
            items={process.hiring_decision ? [{
              id: process.hiring_decision.id,
              primary: `Decisão: ${DECISION_OUTCOME_LABEL[process.hiring_decision.outcome] ?? process.hiring_decision.outcome}`,
              secondary: [
                `Status: ${SIMPLE_STATUS_LABEL[process.hiring_decision.status] ?? process.hiring_decision.status}`,
                process.hiring_decision.submitted_at
                  ? `Enviada em ${formatDateTime(process.hiring_decision.submitted_at)}`
                  : null,
              ].filter(Boolean).join(" · "),
            }] : []}
          />
        </div>
      ) : null}
    </article>
  );
}

function HistorySummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-surface px-3 py-2">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className="mt-1 font-medium text-text">{value}</p>
    </div>
  );
}

function HistoryDetailList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; primary: string; secondary: string }>;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-text">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-surface px-3 py-2">
              <p className="text-sm font-medium text-text">{item.primary}</p>
              {item.secondary ? (
                <p className="mt-1 text-xs text-text-muted">{item.secondary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[hsl(var(--border)/0.7)] bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text-muted">{title}</h2>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </article>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border)/0.7)] bg-surface p-5 shadow-sm">
      <h2 className="mb-4 text-base font-bold text-text">{title}</h2>
      {children}
    </section>
  );
}

function DefinitionList({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="space-y-3 text-sm">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b border-[hsl(var(--border)/0.45)] pb-3 last:border-0 last:pb-0"
        >
          <dt className="text-text-muted">{label}</dt>
          <dd className="text-right font-semibold text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "success" | "neutral" | "info" | "primary" | "danger";
  children: React.ReactNode;
}) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    neutral: "border-border bg-surface-muted text-text-muted",
    info: "border-blue-200 bg-blue-50 text-blue-700",
    primary: "border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${classes[tone]}`}>
      {children}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  primary = false,
  dataTestId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  dataTestId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      className={[
        "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary)/0.9)]"
          : "border border-border bg-surface text-text hover:bg-surface-muted",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function EmptyBlock({
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
      <UserRound className="mx-auto h-8 w-8 text-text-muted" />
      <p className="mt-3 font-bold text-text">{title}</p>
      <p className="mt-1 text-sm text-text-muted">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className="mt-4 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-2xl bg-surface-muted" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  );
}
