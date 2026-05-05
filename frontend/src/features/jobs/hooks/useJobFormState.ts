import { useState } from "react";
import { DEAL_BREAKER_OPERATORS, type DealBreakerDraft, emptyDealBreakerDraft } from "../utils/dealBreakerHelpers";
import { behavioralRequirementKey, EMPTY_FORM, type DealBreaker, type JobFormValues } from "../jobFormConfig";

export function useJobFormState() {
  const [form, setForm] = useState<JobFormValues>(EMPTY_FORM);
  const [dealBreakerDraft, setDealBreakerDraft] = useState<DealBreakerDraft>(emptyDealBreakerDraft());

  function updateForm(updates: Partial<JobFormValues>) {
    setForm((current) => ({ ...current, ...updates }));
  }

  function updateDealBreakerDraft(updates: Partial<DealBreakerDraft>) {
    setDealBreakerDraft((current) => ({ ...current, ...updates }));
  }

  function addBehavioralRequirement() {
    const value = form.newBehavioralRequirement.trim();
    if (!value) return;
    if (
      form.behavioral_requirements.some(
        (item) => behavioralRequirementKey(item) === behavioralRequirementKey(value),
      )
    ) {
      return;
    }
    setForm((current) => ({
      ...current,
      behavioral_requirements: [...current.behavioral_requirements, value],
      newBehavioralRequirement: "",
    }));
  }

  function addDealBreaker() {
    const allowed = DEAL_BREAKER_OPERATORS[dealBreakerDraft.field] ?? ["equals"];
    if (
      !dealBreakerDraft.field ||
      !dealBreakerDraft.value.trim() ||
      !dealBreakerDraft.reason.trim()
    ) {
      return;
    }
    if (!allowed.includes(dealBreakerDraft.operator)) {
      return;
    }
    const item: DealBreaker = {
      field: dealBreakerDraft.field,
      operator: dealBreakerDraft.operator,
      value: dealBreakerDraft.value.trim(),
      reason: dealBreakerDraft.reason.trim(),
      is_active: dealBreakerDraft.is_active,
    };
    setForm((current) => ({
      ...current,
      deal_breakers: [...(current.deal_breakers ?? []), item],
    }));
    setDealBreakerDraft(emptyDealBreakerDraft());
  }

  function resetFormState() {
    setForm(EMPTY_FORM);
    setDealBreakerDraft(emptyDealBreakerDraft());
  }

  return {
    form,
    setForm,
    updateForm,
    dealBreakerDraft,
    setDealBreakerDraft,
    updateDealBreakerDraft,
    addBehavioralRequirement,
    addDealBreaker,
    resetFormState,
  };
}
