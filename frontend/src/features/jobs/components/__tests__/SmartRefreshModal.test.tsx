import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SmartRefreshModal } from "../SmartRefreshModal";
import type { SmartRefreshPreview } from "../../../../services/jobsService";

vi.mock("../../../../components/common/Modal", () => ({
  Modal: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="modal">
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

const BASE_PREVIEW: SmartRefreshPreview = {
  job_id: "job-1",
  total_candidates: 19,
  ranking_recalculation: { count: 1, provider_calls: 0, description: "" },
  ai_analysis: { count: 17, may_use_provider: true, description: "" },
  skipped: { count: 1, reasons: [{ reason: "no_resume", count: 1, description: "Sem currículo." }] },
  warnings: ["16 candidato(s) com análise completada mas dados insuficientes serão reenviados para análise IA.", "A atualização é enfileirada e pode levar alguns instantes."],
};

function renderModal(
  overrides: Partial<SmartRefreshPreview> = {},
  props: {
    previewLoading?: boolean;
    executing?: boolean;
  } = {},
) {
  const preview = { ...BASE_PREVIEW, ...overrides };
  return render(
    <SmartRefreshModal
      open={true}
      preview={preview}
      previewLoading={props.previewLoading ?? false}
      executing={props.executing ?? false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
}

describe("SmartRefreshModal", () => {
  it("renders all four count rows regardless of values", () => {
    renderModal();
    expect(screen.getByText("Total de candidatos")).toBeInTheDocument();
    expect(screen.getByText("Recálculo de ranking (sem IA)")).toBeInTheDocument();
    expect(screen.getByText(/Análise IA/)).toBeInTheDocument();
    expect(screen.getByText("Ignorados")).toBeInTheDocument();
  });

  it("shows Ignorados row even when skipped count is 0", () => {
    renderModal({ skipped: { count: 0, reasons: [] } });
    expect(screen.getByText("Ignorados")).toBeInTheDocument();
  });

  it("shows skip reason breakdown when reasons are present", () => {
    renderModal({
      skipped: {
        count: 2,
        reasons: [{ reason: "no_resume", count: 2 }],
      },
    });
    expect(screen.getByText(/sem currículo/i)).toBeInTheDocument();
  });

  it("shows skip reason description when provided", () => {
    renderModal({
      skipped: {
        count: 1,
        reasons: [
          { reason: "no_resume", count: 1, description: "Adicione um currículo." },
        ],
      },
    });
    expect(screen.getByText(/Adicione um currículo/)).toBeInTheDocument();
  });

  it("shows IA cost warning color when ai_analysis count > 0", () => {
    renderModal();
    const aiLabel = screen.getByText(/Análise IA.*/);
    expect(aiLabel).toBeInTheDocument();
    // ai_analysis count should be highlighted (warning color)
    const count = screen.getByText("17");
    expect(count.className).toMatch(/warning/);
  });

  it("does not apply warning color to ai_analysis count when count is 0", () => {
    renderModal({
      ai_analysis: { count: 0, may_use_provider: false, description: "" },
    });
    const count = screen.getByText("0");
    expect(count.className).not.toMatch(/warning/);
  });

  it("shows all warnings from preview", () => {
    renderModal();
    expect(screen.getByText(/insuficientes serão reenviados/)).toBeInTheDocument();
    expect(screen.getByText(/enfileirada e pode levar/)).toBeInTheDocument();
  });

  it("shows 'Iniciar atualização' as confirm button label", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Iniciar atualização" })).toBeInTheDocument();
  });

  it("shows 'Atualizando...' when executing", () => {
    renderModal({}, { executing: true });
    expect(screen.getByRole("button", { name: "Atualizando..." })).toBeInTheDocument();
  });

  it("shows 'Carregando prévia...' when previewLoading", () => {
    render(
      <SmartRefreshModal
        open={true}
        preview={null}
        previewLoading={true}
        executing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Carregando prévia...")).toBeInTheDocument();
  });

  it("disables buttons while loading", () => {
    renderModal({}, { previewLoading: true });
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("shows failed retry row when failed_retry_count > 0", () => {
    renderModal({
      ai_analysis: { count: 5, may_use_provider: true, description: "", failed_retry_count: 3 },
    });
    expect(screen.getByText("Reprocessar análises com erro")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show failed retry row when failed_retry_count is 0 or absent", () => {
    renderModal({
      ai_analysis: { count: 2, may_use_provider: true, description: "", failed_retry_count: 0 },
    });
    expect(screen.queryByText("Reprocessar análises com erro")).not.toBeInTheDocument();
  });

  it("returns null when not open", () => {
    const { container } = render(
      <SmartRefreshModal
        open={false}
        preview={BASE_PREVIEW}
        previewLoading={false}
        executing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
