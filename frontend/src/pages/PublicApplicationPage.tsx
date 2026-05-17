import { ChevronLeft, ChevronRight, Loader2, Sparkles, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { candidateAuthService } from "../services/candidateAuthService";
import { ApplicationIntroCard } from "../features/public-application/components/ApplicationIntroCard";
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
import { toast } from "../shared/utils/toast";

const GOOGLE_CANDIDATE_STORAGE_KEY = "candidate-google-auth";

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
    applyGoogleCandidate,
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
      const message = err instanceof Error ? err.message : "Erro ao enviar candidatura";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (currentStep === "review") {
      void handleSubmit();
      return;
    }
    nextStep();
  };

  if (successResponse) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <SuccessScreen
            response={successResponse}
            onNewApplication={() => {
              sessionStorage.removeItem(GOOGLE_CANDIDATE_STORAGE_KEY);
              reset();
              setSuccessResponse(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--bg))] px-4 py-12 sm:px-6 lg:px-8">
      {/* Background Orbs */}
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[40rem] w-[40rem] rounded-full bg-[hsl(var(--primary)/0.05)] blur-[120px]" />
      <div className="pointer-events-none absolute right-[-5%] bottom-[-10%] h-[35rem] w-[35rem] rounded-full bg-[hsl(var(--brand-glow)/0.08)] blur-[100px]" />

      <div className="relative mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-10 text-center animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.05)] px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--primary))]">
            <Sparkles className="h-3 w-3" />
            Oportunidade Marajó
          </div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-[hsl(var(--text))] sm:text-5xl">
            Sua jornada <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--brand-glow))] bg-clip-text text-transparent">profissional</span>
          </h1>
          <p className="mt-4 text-[hsl(var(--text-muted))] sm:text-lg">
            Estamos ansiosos para conhecer você. Preencha os dados abaixo para iniciar seu processo.
          </p>
        </div>

        {/* Intro card */}
        <ApplicationIntroCard />

        {/* Form */}
        <form className="relative overflow-hidden rounded-[2.5rem] border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface)/0.7)] p-8 shadow-2xl backdrop-blur-xl transition-all animate-in fade-in zoom-in-95 duration-500" onSubmit={handleFormSubmit} noValidate>
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.02)] to-transparent pointer-events-none" />
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
          {currentStep !== "method" ? <div className="mb-8">
            <div className="flex items-center justify-between">
              {(["method", "personal-data", "job-resume", "review"] as const).map((step, idx) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${
                      currentStep === step
                        ? "bg-blue-600 text-white"
                        : step === "method" ||
                            (step === "personal-data" && currentStep !== "method") ||
                            (step === "job-resume" && (currentStep === "job-resume" || currentStep === "review")) ||
                            (step === "review" && currentStep === "review")
                          ? "bg-blue-100 text-blue-600"
                          : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  {idx < 3 && <div className="mx-2 h-0.5 w-12 bg-gray-300" />}
                </div>
              ))}
            </div>
          </div> : null}

          {/* Steps */}
          <div className="mb-8">
            {currentStep === "method" && (
              <SignupMethodStep
                onSelectManual={nextStep}
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
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={isSubmitting}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>

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
                <Button type="submit" className="flex flex-1 items-center justify-center gap-2">
                  Continuar <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
