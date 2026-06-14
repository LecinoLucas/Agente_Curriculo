import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { CreateSkillModal } from "../CreateSkillModal";
import { skillsService } from "../../../../services/skillsService";

vi.mock("../../../../services/skillsService", () => ({
  skillsService: {
    createSkill: vi.fn(),
  },
}));

describe("CreateSkillModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia aliases separados por vírgula sem vazios e sem duplicidade normalizada", async () => {
    vi.mocked(skillsService.createSkill).mockResolvedValue({
      id: "skill-1",
      name: "Análise de Sistemas",
      normalized_name: "analise de sistemas",
      category: "technical",
      catalog_type: null,
      description: null,
      is_active: true,
      updated_at: "2026-06-14T00:00:00Z",
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      archive_reason_note: null,
      created_at: "2026-06-14T00:00:00Z",
      aliases: [],
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(<CreateSkillModal open initialName="" onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/nome da skill/i), {
      target: { value: "Análise de Sistemas" },
    });
    fireEvent.change(screen.getByLabelText(/aliases/i), {
      target: { value: " ADS, analise de sistemas ,  ads  , " },
    });
    fireEvent.click(screen.getByRole("button", { name: /criar skill/i }));

    await waitFor(() => {
      expect(screen.getByText("Revise os aliases: há duplicidade.")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/aliases/i), {
      target: { value: " ADS, Sistema de Análise " },
    });
    fireEvent.click(screen.getByRole("button", { name: /criar skill/i }));

    await waitFor(() => {
      expect(skillsService.createSkill).toHaveBeenCalledWith({
        name: "Análise de Sistemas",
        category: undefined,
        aliases: ["ADS", "Sistema de Análise"],
        description: undefined,
      });
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
