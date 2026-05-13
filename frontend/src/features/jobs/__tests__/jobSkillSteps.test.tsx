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

    expect(screen.getByText("Essenciais")).toBeInTheDocument();
    expect(screen.getByText("Diferenciais")).toBeInTheDocument();
    expect(screen.getByText("Critérios eliminatórios")).toBeInTheDocument();
    expect(screen.queryByText("Obrigatórias")).not.toBeInTheDocument();
    expect(screen.queryByText("Desejáveis")).not.toBeInTheDocument();
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

  it("exibe filtros compactos de categoria e tipo na seleção de skills", () => {
    const onSkillCategoryFilterChange = vi.fn();
    const onSkillTypeFilterChange = vi.fn();

    render(
      <JobFormMandatorySkillsStep
        mandatorySkills={[]}
        {...baseSkillProps}
        skillCategoryFilter=""
        onSkillCategoryFilterChange={onSkillCategoryFilterChange}
        skillTypeFilter=""
        onSkillTypeFilterChange={onSkillTypeFilterChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Categoria"), {
      target: { value: "frontend" },
    });
    fireEvent.change(screen.getByLabelText("Tipo"), {
      target: { value: "tool" },
    });

    expect(onSkillCategoryFilterChange).toHaveBeenCalledWith("frontend");
    expect(onSkillTypeFilterChange).toHaveBeenCalledWith("tool");
  });
});
