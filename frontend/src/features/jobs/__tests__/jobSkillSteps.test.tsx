import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JobFormDealBreakersStep } from "../sections/JobFormDealBreakersStep";
import { JobFormDifferentialsStep } from "../sections/JobFormDifferentialsStep";
import { JobFormMandatorySkillsStep } from "../sections/JobFormMandatorySkillsStep";


const noopAsync = vi.fn(async () => {});
const noop = vi.fn();

const baseSkillProps = {
  availableSkills: [],
  skillSearch: "",
  onSearchChange: noop,
  skillCategoryFilter: "",
  onSkillCategoryFilterChange: noop,
  skillCategoryOptions: ["frontend", "backend"],
  skillTypeFilter: "",
  onSkillTypeFilterChange: noop,
  skillTypeOptions: ["skill", "tool"],
  savingSkillId: null,
  onAddSkill: noopAsync,
  onUpdateSkill: noopAsync,
  onRemoveSkill: noopAsync,
  onSkillCreated: noop,
};

describe("job skill steps", () => {
  it("exibe Essenciais, Diferenciais e Critérios eliminatórios na UI principal", () => {
    render(
      <div>
        <JobFormMandatorySkillsStep mandatorySkills={[]} {...baseSkillProps} />
        <JobFormDifferentialsStep
          form={{ behavioral_requirements: [], newBehavioralRequirement: "" }}
          optionalSkills={[]}
          onFormChange={noop}
          onAddBehavioralRequirement={noop}
          {...baseSkillProps}
        />
        <JobFormDealBreakersStep
          form={{ title: "", description: "", behavioral_requirements: [], newBehavioralRequirement: "", status: "draft", priority: "normal", deal_breakers: [] }}
          eliminatorySkills={[]}
          dealBreakerDraft={{ field: "", operator: "equals", value: "", reason: "" }}
          onFormChange={noop}
          onDealBreakerDraftChange={noop}
          onAddDealBreaker={noop}
          {...baseSkillProps}
        />
      </div>,
    );

    expect(screen.getByRole("heading", { name: "Essenciais" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Diferenciais" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Critérios eliminatórios" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Obrigatórias" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Desejáveis" })).not.toBeInTheDocument();
  });

  it("mostra alerta quando existem mais de 5 skills essenciais", () => {
    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={Array.from({ length: 6 }, (_, index) => ({
          skill_id: `skill-${index}`,
          skill_name: `Skill ${index}`,
          priority_level: "priority" as const,
          minimum_level: null,
          minimum_years: null,
          weight: 1,
        }))}
        {...baseSkillProps}
      />,
    );

    expect(
      screen.getByText(
        "Muitas skills essenciais podem deixar o ranking restritivo. Considere mover algumas para diferenciais.",
      ),
    ).toBeInTheDocument();
  });

  it("permite tornar uma skill diferencial em essencial", () => {
    const onUpdateSkill = vi.fn(async () => {});
    const differentialSkill = {
      skill_id: "skill-react",
      skill_name: "React",
      priority_level: "complementary" as const,
      minimum_level: null,
      minimum_years: null,
      weight: 1,
    };

    render(
      <JobFormDifferentialsStep
        form={{ behavioral_requirements: [], newBehavioralRequirement: "" }}
        optionalSkills={[differentialSkill]}
        onFormChange={noop}
        onAddBehavioralRequirement={noop}
        {...baseSkillProps}
        onUpdateSkill={onUpdateSkill}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /tornar essencial/i }));

    expect(onUpdateSkill).toHaveBeenCalledWith(differentialSkill, {
      priority_level: "priority",
    });
  });

  it("permite tornar uma skill essencial em diferencial", () => {
    const onUpdateSkill = vi.fn(async () => {});
    const mandatorySkill = {
      skill_id: "skill-node",
      skill_name: "Node.js",
      priority_level: "priority" as const,
      minimum_level: null,
      minimum_years: null,
      weight: 1,
    };

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[mandatorySkill]}
        {...baseSkillProps}
        onUpdateSkill={onUpdateSkill}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /tornar diferencial/i }));

    expect(onUpdateSkill).toHaveBeenCalledWith(mandatorySkill, {
      priority_level: "complementary",
    });
  });

  it("salva peso apenas ao sair do campo e bloqueia transferência enquanto há alteração pendente", async () => {
    const onUpdateSkill = vi.fn(async () => {});
    const mandatorySkill = {
      skill_id: "skill-node",
      skill_name: "Node.js",
      priority_level: "priority" as const,
      minimum_level: null,
      minimum_years: null,
      weight: 1,
    };

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[mandatorySkill]}
        {...baseSkillProps}
        onUpdateSkill={onUpdateSkill}
      />,
    );

    const weightInput = screen.getByLabelText("Peso");
    const transferButton = screen.getByRole("button", { name: /tornar diferencial/i });

    fireEvent.change(weightInput, { target: { value: "2" } });

    expect(onUpdateSkill).not.toHaveBeenCalled();
    expect(transferButton).toBeDisabled();

    fireEvent.blur(weightInput);

    expect(onUpdateSkill).toHaveBeenCalledWith(mandatorySkill, { weight: 2 });
  });

  it("renderiza chips de categoria na seleção de skills, incluindo Outros", () => {
    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
      />,
    );

    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestão" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comportamental" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Técnica" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ferramentas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diferenciais" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outros" })).toBeInTheDocument();
  });

  it("chip selecionado tem aria-pressed=true e os demais aria-pressed=false", () => {
    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
      />,
    );

    const todasBtn = screen.getByRole("button", { name: "Todas" });
    const tecnicaBtn = screen.getByRole("button", { name: "Técnica" });

    expect(todasBtn).toHaveAttribute("aria-pressed", "true");
    expect(tecnicaBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(tecnicaBtn);

    expect(todasBtn).toHaveAttribute("aria-pressed", "false");
    expect(tecnicaBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("chip Técnica filtra apenas skills com catalog_type hard_skill", () => {
    const hardSkill = {
      id: "s1", name: "Python", normalized_name: "python",
      category: "Programação", catalog_type: "hard_skill", description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };
    const softSkill = {
      id: "s2", name: "Comunicação", normalized_name: "comunicacao",
      category: null, catalog_type: "soft_skill", description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
        availableSkills={[hardSkill, softSkill]}
      />,
    );

    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Comunicação")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Técnica" }));

    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.queryByText("Comunicação")).not.toBeInTheDocument();
  });

  it("chip Operacional filtra por keywords operacionais, não por exclusão geral", () => {
    const opSkill = {
      id: "s1", name: "Controle de Estoque", normalized_name: "controle-estoque",
      category: null, catalog_type: null, description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };
    // skill genérica sem keyword operacional → deve ir para Outros, não Operacional
    const genericSkill = {
      id: "s2", name: "Planilha XYZ", normalized_name: "planilha-xyz",
      category: null, catalog_type: null, description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
        availableSkills={[opSkill, genericSkill]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Operacional" }));

    expect(screen.getByText("Controle de Estoque")).toBeInTheDocument();
    expect(screen.queryByText("Planilha XYZ")).not.toBeInTheDocument();
  });

  it("chip Outros exibe apenas skills sem match em nenhuma categoria específica", () => {
    const genericSkill = {
      id: "s1", name: "Planilha XYZ", normalized_name: "planilha-xyz",
      category: null, catalog_type: null, description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };
    const hardSkill = {
      id: "s2", name: "SQL", normalized_name: "sql",
      category: "Banco de dados", catalog_type: "hard_skill", description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
        availableSkills={[genericSkill, hardSkill]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Outros" }));

    expect(screen.getByText("Planilha XYZ")).toBeInTheDocument();
    expect(screen.queryByText("SQL")).not.toBeInTheDocument();
  });

  it("chip Gestão usa keywords fortes, não classifica skills genéricas sem match", () => {
    const mgmtSkill = {
      id: "s1", name: "Gestão de Equipe", normalized_name: "gestao-equipe",
      category: null, catalog_type: null, description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };
    const genericSkill = {
      id: "s2", name: "Planilha Geral", normalized_name: "planilha-geral",
      category: null, catalog_type: null, description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
        availableSkills={[mgmtSkill, genericSkill]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Gestão" }));

    expect(screen.getByText("Gestão de Equipe")).toBeInTheDocument();
    expect(screen.queryByText("Planilha Geral")).not.toBeInTheDocument();
  });

  it("skills sem categoria aparecem após as com categoria na lista", () => {
    const withCat = {
      id: "s1", name: "React", normalized_name: "react",
      category: "Frontend", catalog_type: "hard_skill", description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };
    const noCat = {
      id: "s2", name: "ZSkillSemCategoria", normalized_name: "zskill",
      category: null, catalog_type: null, description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
        availableSkills={[noCat, withCat]}
      />,
    );

    const allText = document.body.textContent ?? "";
    expect(allText.indexOf("React")).toBeLessThan(allText.indexOf("ZSkillSemCategoria"));
  });

  it("exibe bloco de sugestões quando o título da vaga sugere gestão", () => {
    const leadershipSkill = {
      id: "s1", name: "Liderança", normalized_name: "lideranca",
      category: "Gestão", catalog_type: "soft_skill", description: null,
      is_active: true, updated_at: "", archived_at: null, archived_by: null,
      archive_reason: null, archive_reason_note: null, created_at: "", aliases: [],
    };

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
        availableSkills={[leadershipSkill]}
        jobContext={{ title: "Gestor de Equipe", jobArea: "Operações" }}
      />,
    );

    expect(screen.getByText("Sugestões para esta vaga")).toBeInTheDocument();
  });

  it("não exibe sugestões quando a vaga não é de gestão", () => {
    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
        availableSkills={[]}
        jobContext={{ title: "Desenvolvedor Frontend", jobArea: "Tecnologia" }}
      />,
    );

    expect(screen.queryByText("Sugestões para esta vaga")).not.toBeInTheDocument();
  });
});
