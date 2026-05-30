import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiSkillSuggestionsBlock } from "../AiSkillSuggestionsBlock";
import { skillsService, type SkillCatalog } from "@/services/skillsService";

vi.mock("@/services/skillsService", () => ({
  skillsService: {
    listSkills: vi.fn(),
  },
}));

const MANDATORY = ["Atendimento ao cliente", "Operação de caixa"];
const OPTIONAL = ["Experiência anterior com caixa"];

function skill(name: string, id = name.toLowerCase().replace(/\s+/g, "-")): SkillCatalog {
  return {
    id,
    name,
    normalized_name: name.toLowerCase(),
    category: "Atendimento",
    catalog_type: "technical",
    description: null,
    is_active: true,
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_reason_note: null,
    created_at: "2026-01-01T00:00:00Z",
    aliases: [],
  };
}

const catalog = [
  skill("Atendimento ao cliente", "skill-atendimento"),
  skill("Operação de caixa", "skill-caixa"),
  skill("Experiência anterior com caixa", "skill-exp-caixa"),
];

function mockSkillLookup(foundSkills: SkillCatalog[] = catalog) {
  vi.mocked(skillsService.listSkills).mockImplementation(async ({ search }) => {
    const term = String(search ?? "").trim().toLowerCase();
    const data = foundSkills.filter((item) => {
      if (item.name.toLowerCase() === term) return true;
      if (item.normalized_name.toLowerCase() === term) return true;
      return item.aliases.some((alias) => alias.alias.toLowerCase() === term || alias.normalized_alias.toLowerCase() === term);
    });
    return {
      data,
      total: data.length,
      page: 1,
      page_size: 10,
      total_pages: 1,
    };
  });
}

function renderBlock(
  overrides: Partial<Parameters<typeof AiSkillSuggestionsBlock>[0]> = {},
) {
  const onApply = vi.fn();
  const onDismiss = vi.fn();
  render(
    <AiSkillSuggestionsBlock
      mandatory={MANDATORY}
      optional={OPTIONAL}
      onApply={onApply}
      onDismiss={onDismiss}
      {...overrides}
    />,
  );
  return { onApply, onDismiss };
}

async function waitForResolution() {
  await waitFor(() => expect(screen.queryByText("Validando catálogo")).not.toBeInTheDocument());
}

describe("AiSkillSuggestionsBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkillLookup();
  });

  it("renderiza o bloco com título 'Skills sugeridas pela IA'", async () => {
    renderBlock();
    expect(screen.getByTestId("ai-skill-suggestions")).toBeInTheDocument();
    expect(screen.getByText(/Skills sugeridas pela IA/i)).toBeInTheDocument();
    await waitForResolution();
  });

  it("exibe aviso de revisão humana", async () => {
    renderBlock();
    expect(
      screen.getByText(/a ia sugere as skills, mas o rh precisa confirmar/i),
    ).toBeInTheDocument();
    await waitForResolution();
  });

  it("skill encontrada aparece com status correto", async () => {
    renderBlock();
    await waitForResolution();
    expect(screen.getAllByText("Encontrada no catálogo").length).toBe(3);
  });

  it("skill não encontrada não é aplicada", async () => {
    mockSkillLookup([catalog[0]]);
    const { onApply } = renderBlock({
      mandatory: ["Atendimento ao cliente", "Skill inexistente"],
      optional: [],
    });

    await waitForResolution();
    expect(screen.getByText("Não encontrada")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ai-suggestions-apply"));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const selected = onApply.mock.calls[0][0] as Array<{ name: string }>;
    expect(selected).toEqual([expect.objectContaining({ name: "Atendimento ao cliente" })]);
    expect(selected.find((item) => item.name === "Skill inexistente")).toBeUndefined();
  });

  it("skill já adicionada aparece como duplicada e não duplica no apply", async () => {
    const { onApply } = renderBlock({
      linkedSkills: [
        {
          skill_id: "skill-atendimento",
          skill_name: "Atendimento ao cliente",
          priority_level: "priority",
          minimum_level: null,
          minimum_years: null,
          weight: 1,
        },
      ],
    });

    await waitForResolution();
    expect(screen.getByText("Já adicionada")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ai-suggestions-apply"));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const selected = onApply.mock.calls[0][0] as Array<{ skill_id: string }>;
    expect(selected.find((item) => item.skill_id === "skill-atendimento")).toBeUndefined();
  });

  it("aplicar selecionadas chama handler com IDs e objetos do catálogo", async () => {
    const { onApply } = renderBlock();
    await waitForResolution();

    fireEvent.click(screen.getByTestId("ai-suggestions-apply"));
    await waitFor(() => expect(onApply).toHaveBeenCalled());

    const selected = onApply.mock.calls[0][0] as Array<{ name: string; skill_id: string; skill: SkillCatalog; priority: string }>;
    expect(selected).toHaveLength(3);
    expect(selected[0]).toMatchObject({
      name: "Atendimento ao cliente",
      skill_id: "skill-atendimento",
      priority: "priority",
      skill: expect.objectContaining({ id: "skill-atendimento" }),
    });
    expect(selected[2]).toMatchObject({
      name: "Experiência anterior com caixa",
      skill_id: "skill-exp-caixa",
      priority: "complementary",
      skill: expect.objectContaining({ id: "skill-exp-caixa" }),
    });
  });

  it("desmarcar skill impede aplicação", async () => {
    const { onApply } = renderBlock();
    await waitForResolution();

    fireEvent.click(screen.getByTestId(`ai-skill-checkbox-${MANDATORY[0]}`));
    fireEvent.click(screen.getByTestId("ai-suggestions-apply"));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const selected = onApply.mock.calls[0][0] as Array<{ name: string }>;
    expect(selected.find((item) => item.name === MANDATORY[0])).toBeUndefined();
  });

  it("ignorar sugestões limpa o bloco via callback", async () => {
    const { onDismiss } = renderBlock();
    await waitForResolution();
    fireEvent.click(screen.getByTestId("ai-suggestions-dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("botão Aplicar fica desabilitado quando nenhuma skill encontrada está marcada", async () => {
    renderBlock();
    await waitForResolution();

    for (const cb of screen.getAllByRole("checkbox")) fireEvent.click(cb);

    const applyBtn = screen.getByTestId("ai-suggestions-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });

  it("renderiza corretamente sem optional skills", async () => {
    renderBlock({ optional: [] });
    expect(screen.queryByTestId("ai-suggestions-optional-label")).not.toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestions-mandatory-label")).toBeInTheDocument();
    await waitForResolution();
  });

  it("renderiza corretamente sem mandatory skills", async () => {
    renderBlock({ mandatory: [] });
    expect(screen.queryByTestId("ai-suggestions-mandatory-label")).not.toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestions-optional-label")).toBeInTheDocument();
    await waitForResolution();
  });

  it("resolve por alias exato do catálogo", async () => {
    mockSkillLookup([
      {
        ...skill("Comunicação", "skill-comunicacao"),
        aliases: [{ id: "alias-1", alias: "Atendimento ao cliente", normalized_alias: "atendimento ao cliente" }],
      },
    ]);
    const { onApply } = renderBlock({ mandatory: ["Atendimento ao cliente"], optional: [] });

    await waitForResolution();
    fireEvent.click(screen.getByTestId("ai-suggestions-apply"));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        name: "Comunicação",
        skill_id: "skill-comunicacao",
      }),
    ]);
  });
});
