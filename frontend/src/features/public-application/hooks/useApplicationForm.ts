import { useState, useCallback } from "react";
import type { CandidateGoogleLoginResponse } from "../../../types/auth";
import { validatePhone } from "../utils/phone";
import { formatSalaryExpectationInput, normalizeSalaryExpectation } from "../utils/salary";
import type { ApplicationErrors, FormData, Step } from "../types";

const INITIAL_FORM: FormData = {
  authMethod: "manual",
  emailLocked: false,
  googlePictureUrl: null,
  fullName: "",
  cpf: "",
  email: "",
  phone: "",
  city: "",
  state: "SP",
  password: "",
  confirmPassword: "",
  salaryExpectation: "",
  desiredContractType: "CLT",
  worksAtMarajoGroup: false,
  jobId: null,
  resumeFile: null,
  lgpdConsent: false,
};

export function useApplicationForm() {
  const [currentStep, setCurrentStep] = useState<Step>("method");
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateForm = useCallback((field: keyof FormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Limpar erro do campo ao editar
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const validateStep = useCallback((): boolean => {
    const newErrors: ApplicationErrors = {};

    if (currentStep === "personal-data") {
      if (!form.fullName.trim()) {
        newErrors.fullName = "Nome completo é obrigatório";
      }

      if (!form.cpf) {
        newErrors.cpf = "CPF é obrigatório";
      }

      if (!form.email) {
        newErrors.email = "E-mail é obrigatório";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        newErrors.email = "E-mail inválido";
      }

      if (!form.phone) {
        newErrors.phone = "Telefone é obrigatório";
      } else if (!validatePhone(form.phone)) {
        newErrors.phone = "Telefone deve ter 10 ou 11 dígitos";
      }

      if (!form.city.trim()) {
        newErrors.city = "Cidade é obrigatória";
      }

      if (!form.state) {
        newErrors.state = "Estado é obrigatório";
      }

      if (form.authMethod === "manual") {
        if (!form.password) {
          newErrors.password = "Senha é obrigatória";
        } else if (form.password.length < 8) {
          newErrors.password = "Senha deve ter no mínimo 8 caracteres";
        }

        if (!form.confirmPassword) {
          newErrors.confirmPassword = "Confirmação de senha é obrigatória";
        } else if (form.confirmPassword !== form.password) {
          newErrors.confirmPassword = "Confirmação de senha não confere";
        }
      }
    }

    if (currentStep === "job-resume") {
      if (!form.salaryExpectation.trim()) {
        newErrors.salaryExpectation = "Informe sua pretensão salarial.";
      } else if (!normalizeSalaryExpectation(form.salaryExpectation)) {
        newErrors.salaryExpectation = "Informe uma pretensão salarial válida.";
      }

      if (!form.resumeFile) {
        newErrors.resumeFile = "Currículo é obrigatório";
      } else if (!form.resumeFile.name.endsWith(".pdf")) {
        newErrors.resumeFile = "Arquivo deve ser um PDF";
      } else if (form.resumeFile.size > 10 * 1024 * 1024) {
        newErrors.resumeFile = "Arquivo deve ter no máximo 10 MB";
      }

      if (!form.desiredContractType) {
        newErrors.desiredContractType = "Regime desejado é obrigatório";
      }
    }

    if (currentStep === "review") {
      if (!form.lgpdConsent) {
        newErrors.lgpdConsent = "É necessário aceitar os termos";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [currentStep, form]);

  const nextStep = useCallback(() => {
    if (!validateStep()) return;

    const steps: Step[] = ["method", "personal-data", "job-resume", "review"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  }, [currentStep, validateStep]);

  const prevStep = useCallback(() => {
    const steps: Step[] = ["method", "personal-data", "job-resume", "review"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  }, [currentStep]);

  const reset = useCallback(() => {
    setForm(INITIAL_FORM);
    setErrors({});
    setCurrentStep("method");
    setIsSubmitting(false);
  }, []);

  const applyGoogleCandidate = useCallback((payload: CandidateGoogleLoginResponse) => {
    setForm((prev) => ({
      ...prev,
      authMethod: "google",
      emailLocked: payload.candidate.email_locked,
      googlePictureUrl: payload.candidate.picture_url,
      fullName: payload.candidate.full_name ?? prev.fullName,
      email: payload.candidate.email ?? prev.email,
      phone: payload.candidate.phone ?? prev.phone,
      cpf: payload.candidate.cpf ?? prev.cpf,
      salaryExpectation: payload.candidate.salary_expectation
        ? formatSalaryExpectationInput(payload.candidate.salary_expectation.replace(/\D/g, ""))
        : prev.salaryExpectation,
      password: "",
      confirmPassword: "",
    }));
    setErrors({});
    setCurrentStep("personal-data");
  }, []);

  const clearGoogleData = useCallback(() => {
    setForm((prev) => {
      if (prev.authMethod === "google") {
        return {
          ...prev,
          authMethod: "manual",
          emailLocked: false,
          googlePictureUrl: null,
          fullName: "",
          email: "",
          phone: "",
          cpf: "",
          salaryExpectation: "",
          password: "",
          confirmPassword: "",
        };
      }
      return prev;
    });
    setErrors({});
  }, []);

  return {
    currentStep,
    form,
    errors,
    setErrors,
    isSubmitting,
    setIsSubmitting,
    updateForm,
    nextStep,
    prevStep,
    reset,
    validateStep,
    applyGoogleCandidate,
    clearGoogleData,
    setCurrentStep,
  };
}
