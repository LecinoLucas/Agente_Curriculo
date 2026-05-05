import { useMemo, useState } from "react";
import type { JobFormValues, JobQualityResult } from "../../../types/domain";
import type { Job } from "../../../types/domain";
import { buildFrontendPublicationBlockers } from "../utils/jobFormHelpers";
import { getPublicationPanelState } from "../utils/publicationState";

interface UseJobPublicationOptions {
  form: JobFormValues;
  currentJob: Job | null;
  mandatorySkillsCount: number;
}

export function useJobPublication(options: UseJobPublicationOptions) {
  const [jobQuality, setJobQuality] = useState<JobQualityResult | null>(null);
  const [backendPublishErrors, setBackendPublishErrors] = useState<string[]>([]);

  const frontendBlockers = useMemo(
    () => buildFrontendPublicationBlockers(options.form, options.mandatorySkillsCount),
    [options.form, options.mandatorySkillsCount],
  );

  const publicationState = useMemo(
    () => getPublicationPanelState(options.form, options.currentJob, jobQuality, frontendBlockers),
    [options.form, options.currentJob, jobQuality, frontendBlockers],
  );

  const canTryPublishFrontend = frontendBlockers.length === 0 && options.mandatorySkillsCount >= 2;

  return {
    jobQuality,
    setJobQuality,
    backendPublishErrors,
    setBackendPublishErrors,
    frontendBlockers,
    publicationState,
    canTryPublishFrontend,
  };
}
