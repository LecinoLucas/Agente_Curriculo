import { ChevronLeft, ChevronRight, Loader2, Sparkles, HelpCircle, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { candidateAuthService } from "../services/candidateAuthService";
import { JobResumeStep } from "../features/public-application/components/JobResumeStep";
import { PersonalDataStep } from "../features/public-application/components/PersonalDataStep";
import { ReviewStep } from "../features/public-application/components/ReviewStep";
import { SignupMethodStep } from "../features/public-application/components/SignupMethodStep";
import { SuccessScreen } from "../features/public-application/components/SuccessScreen";
import { useApplicationForm } from "../features/public-application/hooks/useApplicationForm";
import { publicApplicationService } from "../features/public-application/services/publicApplicationService";
import { normalizeSalaryExpectation } from "../features/public-application/utils/salary";
import type { ApplyResponse } from "../features/public-application/types";
import type { CandidateGoogleLoginResponse } from "../types/auth";
import { HttpError } from "../services/http";
import { toast } from "../shared/utils/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { CandidatePublicShell } from "../components/auth/CandidatePublicShell";

const GOOGLE_CANDIDATE_STORAGE_KEY = "candidate-google-auth";
const PUBLIC_DUPLICATE_MESSAGE =
  "Recebemos sua solicitação. Se já houver cadastro, atualizaremos seu processo conforme as regras do RH.";

function resolvePublicSubmitErrorMessage(error: unknown) {
  if (error instanceof HttpError && error.status === 409) {
    return PUBLIC_DUPLICATE_MESSAGE;
  }
  return error instanceof Error ? error.message : "Erro ao enviar candidatura";
}

export function PublicApplicationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentStep,
    form,
    errors,
    isSubmitting,
    setIsSubmitting,
    updateForm,
    nextStep,
    prevStep,
    reset,
    validateStep,
    applyGoogleCandidate,
    clearGoogleData,
  } = useApplicationForm();
  const [successResponse, setSuccessResponse] = useState<ApplyResponse | null>(null);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const syncGoogleState = useCallback(
    (payload: CandidateGoogleLoginResponse) => {
      sessionStorage.setItem(GOOGLE_CANDIDATE_STORAGE_KEY, JSON.stringify(payload));
      applyGoogleCandidate(payload);
      setGoogleNotice(payload.message);
      setGoogleError(null);
    },
    [applyGoogleCandidate]
  );

  useEffect(() => {
    const navigationState = location.state as { googleAuth?: CandidateGoogleLoginResponse } | null;
    const fromNavigation = navigationState?.googleAuth;
    if (fromNavigation) {
      syncGoogleState(fromNavigation);
      return;
    }

    const stored = sessionStorage.getItem(GOOGLE_CANDIDATE_STORAGE_KEY);
    if (!stored) return;

    try {
      syncGoogleState(JSON.parse(stored) as CandidateGoogleLoginResponse);
    } catch {
      sessionStorage.removeItem(GOOGLE_CANDIDATE_STORAGE_KEY);
    }
  }, [location.state, syncGoogleState]);

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setIsSubmitting(true);
      setGoogleError(null);
      try {
        const response = await candidateAuthService.googleLogin({ id_token: idToken });
        if (response.status === "authenticated") {
          sessionStorage.removeItem(GOOGLE_CANDIDATE_STORAGE_KEY);
          toast.success("Login com Google realizado com sucesso.");
          navigate(response.redirect_to, { replace: true });
          return;
        }

        syncGoogleState(response);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Não foi possível concluir o login com Google.";
        setGoogleError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [navigate, setIsSubmitting, syncGoogleState]
  );

  const handleCancelGoogleFlow = useCallback(() => {
    if (window.confirm("Deseja realmente cancelar seu cadastro via Google?")) {
      sessionStorage.removeItem(GOOGLE_CANDIDATE_STORAGE_KEY);
      reset();
      navigate("/candidato", { replace: true, state: {} });
    }
  }, [navigate, reset]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("full_name", form.fullName);
      formData.append("cpf", form.cpf);
      formData.append("email", form.email);
      formData.append("phone", form.phone);
      formData.append("city", form.city);
      formData.append("state", form.state);
      if (form.authMethod === "manual") {
        formData.append("password", form.password);
        formData.append("confirm_password", form.confirmPassword);
      }
      formData.append("salary_expectation", normalizeSalaryExpectation(form.salaryExpectation) ?? "");
      formData.append("desired_contract_type", form.desiredContractType);
      formData.append("works_at_marajo_group", form.worksAtMarajoGroup ? "true" : "false");
      formData.append("lgpd_consent", form.lgpdConsent ? "true" : "false");
      if (form.jobId) {
        formData.append("job_id", form.jobId);
      }
      if (form.resumeFile) {
        formData.append("resume_file", form.resumeFile);
      }

      const response = await publicApplicationService.submitApplication(formData);
      setSuccessResponse(response);
      sessionStorage.removeItem(GOOGLE_CANDIDATE_STORAGE_KEY);
      toast.success("Candidatura enviada com sucesso!");
      navigate("/candidato/portal", { replace: true });
    } catch (err: unknown) {
      toast.error(resolvePublicSubmitErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (currentStep === "review") {
      void handleSubmit();
      return;
    }

    if (currentStep === "personal-data") {
      if (!validateStep()) return;
    }

    nextStep();
  };

  if (successResponse) {
    return (
      <CandidatePublicShell
        eyebrow="Tudo Pronto"
        title="Parabéns!"
        subtitle="Sua candidatura foi registrada com sucesso."
        maxWidth="md"
      >
        <SuccessScreen
          response={successResponse}
          onNewApplication={() => {
            sessionStorage.removeItem(GOOGLE_CANDIDATE_STORAGE_KEY);
            reset();
            setSuccessResponse(null);
          }}
        />
      </CandidatePublicShell>
    );
  }

  const topAction = (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 transition-all hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm hover:shadow"
          title="Instruções importantes"
        >
          <HelpCircle className="h-4.5 w-4.5" />
          <span>Instruções</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md border border-border/50 bg-card p-6 shadow-2xl backdrop-blur-xl rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-lg font-bold text-primary">
            <Info className="h-5 w-5" />
            Instruções Importantes
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground font-medium">
            Orientações importantes para o preenchimento de sua candidatura:
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-4 space-y-3.5 text-sm font-medium leading-relaxed text-muted-foreground">
          <li className="flex gap-3 items-start">
            <span className="text-primary font-bold mt-0.5">•</span>
            <span>Antes de se inscrever, leia o anúncio da vaga.</span>
          </li>
          <li className="flex gap-3 items-start">
            <span className="text-primary font-bold mt-0.5">•</span>
            <span>Selecione corretamente a vaga desejada.</span>
          </li>
          <li className="flex gap-3 items-start">
            <span className="text-primary font-bold mt-0.5">•</span>
            <span>Caso não encontre uma vaga de interesse, selecione Banco de Talentos.</span>
          </li>
          <li className="flex gap-3 items-start">
            <span className="text-primary font-bold mt-0.5">•</span>
            <span>Ao finalizar, aguarde a confirmação de envio.</span>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );

  return (
    <CandidatePublicShell
      eyebrow="Oportunidade Marajó"
      title={
        <>
          Sua jornada{" "}
          <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
            profissional
          </span>
        </>
      }
      subtitle="Estamos ansiosos para conhecer você. Preencha os dados abaixo para iniciar seu processo."
      maxWidth="2xl"
      topAction={topAction}
    >
      <form
        className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card p-6 sm:p-8 shadow-lg"
        onSubmit={handleFormSubmit}
        noValidate
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-primary/60" />
        {googleNotice ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {googleNotice}
          </div>
        ) : null}
        {googleError ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {googleError}
          </div>
        ) : null}
        {/* Progress indicator */}
        {currentStep !== "method" ? (
          <div className="mb-6">
            <div className="flex items-center justify-between">
              {(["method", "personal-data", "job-resume", "review"] as const).map((step, idx) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      currentStep === step
                        ? "bg-primary text-white"
                        : step === "method" ||
                            (step === "personal-data" && currentStep !== "method") ||
                            (step === "job-resume" && (currentStep === "job-resume" || currentStep === "review")) ||
                            (step === "review" && currentStep === "review")
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  {idx < 3 && <div className="mx-2 h-0.5 w-12 bg-border" />}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Steps */}
        <div className="mb-6">
          {currentStep === "method" && (
            <SignupMethodStep
              onSelectManual={() => {
                sessionStorage.removeItem(GOOGLE_CANDIDATE_STORAGE_KEY);
                setGoogleNotice(null);
                setGoogleError(null);
                clearGoogleData();
                nextStep();
              }}
              onGoogleCredential={handleGoogleCredential}
              onGoogleError={setGoogleError}
              googleDisabled={isSubmitting}
            />
          )}
          {currentStep === "personal-data" && (
            <PersonalDataStep form={form} errors={errors} onChange={updateForm} />
          )}
          {currentStep === "job-resume" && <JobResumeStep form={form} errors={errors} onChange={updateForm} />}
          {currentStep === "review" && <ReviewStep form={form} errors={errors} onChange={updateForm} />}
        </div>

        {/* Navigation */}
        {currentStep !== "method" && (
          <div className="flex gap-3">
            {currentStep === "personal-data" && form.authMethod === "google" ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelGoogleFlow}
                disabled={isSubmitting}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                Cancelar cadastro
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={isSubmitting}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
            )}

            {currentStep === "review" ? (
              <Button
                type="submit"
                disabled={isSubmitting || !form.lgpdConsent}
                className="flex flex-1 items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Enviando..." : "Enviar candidatura"}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Verificando..." : "Continuar"} {!isSubmitting && <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
          </div>
        )}
      </form>
    </CandidatePublicShell>
  );
}
