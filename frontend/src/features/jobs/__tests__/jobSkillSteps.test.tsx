import { render, screen } from "@testing-library/react";
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
  savingSkillId: null,
  onAddSkill: noopAsync,
  onUpdateSkill: noopAsync,
  onRemoveSkill: noopAsync,
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
});
