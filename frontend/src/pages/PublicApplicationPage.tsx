import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ApplicationIntroCard } from "../features/public-application/components/ApplicationIntroCard";
import { JobResumeStep } from "../features/public-application/components/JobResumeStep";
import { PersonalDataStep } from "../features/public-application/components/PersonalDataStep";
import { ReviewStep } from "../features/public-application/components/ReviewStep";
import { SignupMethodStep } from "../features/public-application/components/SignupMethodStep";
import { SuccessScreen } from "../features/public-application/components/SuccessScreen";
import { useApplicationForm } from "../features/public-application/hooks/useApplicationForm";
import { publicApplicationService } from "../features/public-application/services/publicApplicationService";
import type { ApplyResponse } from "../features/public-application/types";
import { toast } from "../shared/utils/toast";

export function PublicApplicationPage() {
  const navigate = useNavigate();
  const { currentStep, form, errors, isSubmitting, setIsSubmitting, updateForm, nextStep, prevStep, reset } =
    useApplicationForm();
  const [successResponse, setSuccessResponse] = useState<ApplyResponse | null>(null);

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
      formData.append("password", form.password);
      formData.append("confirm_password", form.confirmPassword);
      formData.append("salary_expectation", form.salaryExpectation);
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
              reset();
              setSuccessResponse(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Processo seletivo</h1>
          <p className="mt-2 text-gray-600">
            Bem-vindo(a)! Ficamos felizes com seu interesse em fazer parte do nosso time.
          </p>
        </div>

        {/* Intro card */}
        <ApplicationIntroCard />

        {/* Form */}
        <form className="rounded-lg bg-white p-8 shadow" onSubmit={handleFormSubmit} noValidate>
          {/* Progress indicator */}
          <div className="mb-8">
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
          </div>

          {/* Steps */}
          <div className="mb-8">
            {currentStep === "method" && <SignupMethodStep onSelectManual={nextStep} />}
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
