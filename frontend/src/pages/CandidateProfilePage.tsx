import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  X,
} from "lucide-react";

import { Tabs } from "../components/common/Tabs";
import { CandidateProfileScoreTab } from "../features/candidates/profile/components/CandidateProfileScoreTab";
import { CandidateProfileDocumentsTab } from "../features/candidates/profile/components/CandidateProfileDocumentsTab";
import {
  CandidateProfileHistoryTab,
  CurrentProcessHistoryHint,
} from "../features/candidates/profile/components/CandidateProfileHistoryTab";
import { CandidateProfileBehavioralAssessmentsTab } from "../features/candidates/profile/components/CandidateProfileBehavioralAssessmentsTab";
import {
  ActionButton,
  Badge,
  EmptyBlock,
  InfoCard,
  SectionCard,
  DefinitionList,
} from "../features/candidates/profile/components/ProfileSharedUI";
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
  type CandidateProfileTabKey,
} from "../features/candidates/profile/utils/getVisibleCandidateProfileTabs";
import {
  PROFILE_TABS,
  type CandidateProfileFocus,
  resolveSearchTab,
  resolveInitialTab,
  resolveInitialFocus,
} from "../features/candidates/profile/profileTabs";
import {
  STAGE_OPTIONS,
} from "../features/candidates/profile/profileStatusLabels";
import {
  toDatetimeLocal,
  fromDatetimeLocal,
  formatDateTime,
  getScoreStrengths,
  getScoreAttentionPoints,
} from "../features/candidates/profile/profileFormatters";
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
import { agendaService } from "../services/agendaService";
import { analysisService } from "../services/analysisService";
import { aiLimitsService, type AILimitsUsage } from "../services/aiLimitsService";
import { candidatesService } from "../services/candidatesService";
import { HttpError } from "../services/http";
import { formatContextError } from "../services/errorMessages";
import { listJobs } from "../services/jobsService";
import { pipelineService } from "../services/pipelineService";
import { createPreAdmission, getPreAdmission } from "../services/preAdmissionService";
import { scoreExplanationService, type ScoreExplanationResponse } from "../services/scoreExplanationService";
import { toast } from "../shared/utils/toast";
import type {
  AnalysisResult,
  AnalysisStatus,
  CandidateOverview,
  CandidatePipelineEntryOverview,
  CandidatePreviewPendencyOverview,
  Job,
  JobRankingEntry,
  PipelineStage,
  PreAdmissionEnvelope,
} from "../types/domain";
import type { InterviewFormat, InterviewSchedule, InterviewType } from "../types/agenda";

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
            <CandidateProfileScoreTab
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
            />
          ) : null}
          {activeTab === "documents" ? (
            <CandidateProfileDocumentsTab overview={overview} onReload={reloadWorkspace} />
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
            <CandidateProfileBehavioralAssessmentsTab
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
            <CandidateProfileHistoryTab
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
