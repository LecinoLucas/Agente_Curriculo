import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditSkillModal } from "../EditSkillModal";
import { skillsService, type SkillCatalog } from "../../../../services/skillsService";

vi.mock("../../../../services/skillsService", () => ({
  skillsService: {
    updateSkill: vi.fn(),
  },
}));

function buildSkill(): SkillCatalog {
  return {
    id: "skill-1",
    name: "JavaScript",
    normalized_name: "javascript",
    category: "technical",
    catalog_type: null,
    description: "Linguagem",
    is_active: true,
    updated_at: "2026-06-14T00:00:00Z",
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_reason_note: null,
    created_at: "2026-06-14T00:00:00Z",
    aliases: [
      { id: "alias-1", alias: "JS", normalized_alias: "js" },
      { id: "alias-2", alias: "EcmaScript", normalized_alias: "ecmascript" },
    ],
  };
}

describe("EditSkillModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exibe aliases atuais e envia aliases editados", async () => {
    vi.mocked(skillsService.updateSkill).mockResolvedValue(buildSkill());

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(<EditSkillModal open skill={buildSkill()} onClose={onClose} onSuccess={onSuccess} />);

    expect(screen.getByDisplayValue("JS, EcmaScript")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("JS, EcmaScript"), {
      target: { value: "JS, Java Script" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(skillsService.updateSkill).toHaveBeenCalledWith("skill-1", {
        name: "JavaScript",
        category: "technical",
        aliases: ["JS", "Java Script"],
        description: "Linguagem",
      });
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
