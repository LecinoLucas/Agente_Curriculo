import { describe, expect, it } from "vitest";

import { EMPTY_FORM } from "../../features/jobs/jobFormConfig";
import { buildFrontendPublicationBlockers } from "../../features/jobs/utils/jobFormHelpers";

describe("JobFormPage publication guards", () => {
  it("blocks publication when behavioral assessment is required and no template is linked", () => {
    const blockers = buildFrontendPublicationBlockers(
      {
        ...EMPTY_FORM,
        requires_behavioral_assessment: true,
        behavioral_template_id: null,
      },
      2,
    );

    expect(blockers).toContain("behavioral_template_id");
  });

  it("does not block template when behavioral assessment is disabled", () => {
    const blockers = buildFrontendPublicationBlockers(
      {
        ...EMPTY_FORM,
        requires_behavioral_assessment: false,
        behavioral_template_id: null,
      },
      2,
    );

    expect(blockers).not.toContain("behavioral_template_id");
  });
});
