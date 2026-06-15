import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AnalysisRow } from "../AnalysisRow";
import type { AnalysisGlobalItem } from "../../../../types/domain";

vi.mock("../../../../components/common/ActionMenu", () => ({
  ActionMenu: ({
    items,
    buttonLabel,
  }: {
    items: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
    buttonLabel: string;
  }) => (
    <div>
      <button type="button">{buttonLabel}</button>
      <div>
        {items.map((item) => (
          <button key={item.label} type="button" onClick={item.onClick} disabled={item.disabled}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  ),
}));

function makeItem(overrides: Partial<AnalysisGlobalItem> = {}): AnalysisGlobalItem {
  return {
    id: "analysis-1",
    type: "resume",
    job_id: "job-1",
    candidate_id: "candidate-1",
    candidate_name: "Ana",
    candidate_email: "ana@example.com",
    resume_file_name: "ana.pdf",
    resume_version_id: "version-1",
    status: "failed",
    failure_reason: "OCR failed: PDF ilegível",
    used_real_ai: true,
    retry_count: 0,
    next_retry_at: null,
    provider_error_type: null,
    provider_status_code: null,
    stuck: false,
    reason: null,
    created_at: "2026-06-14T10:00:00Z",
    updated_at: "2026-06-14T10:01:00Z",
    started_at: null,
    completed_at: null,
    failed_at: "2026-06-14T10:01:00Z",
    ...overrides,
  };
}

describe("AnalysisRow", () => {
  it("mostra falha de OCR com mensagem correta e sem ação de reprocessar IA", async () => {
    render(
      <table>
        <tbody>
          <AnalysisRow
            item={makeItem()}
            actionInFlight={false}
            onOpen={vi.fn()}
            onRetry={vi.fn()}
            onForceFail={vi.fn()}
            onDiscard={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(screen.getByText(/Não foi possível extrair o texto do currículo/i)).toBeInTheDocument();
    expect(screen.getByText(/Esta falha é de extração\/OCR/i)).toBeInTheDocument();
    expect(screen.queryByText("Reprocessar")).not.toBeInTheDocument();
  });

  it("mantém retry disponível para falha real de IA", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <table>
        <tbody>
          <AnalysisRow
            item={makeItem({
              failure_reason: "Timeout no provedor IA",
              provider_error_type: "provider_timeout",
            })}
            actionInFlight={false}
            onOpen={vi.fn()}
            onRetry={onRetry}
            onForceFail={vi.fn()}
            onDiscard={vi.fn()}
          />
        </tbody>
      </table>,
    );

    await user.click(screen.getByText("Reprocessar"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
