import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { jobSkillsServiceMock, toastMock } = vi.hoisted(() => ({
  jobSkillsServiceMock: {
    addJobSkill: vi.fn(),
    listJobSkills: vi.fn(),
    removeJobSkill: vi.fn(),
    updateJobSkill: vi.fn(),
  },
  toastMock: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../../services/jobSkillsService", () => ({
  jobSkillsService: jobSkillsServiceMock,
}));

vi.mock("../../../../shared/utils/toast", () => ({
  toast: toastMock,
}));

import { isSkillAlreadyLinked, useJobSkills } from "../useJobSkills";

describe("useJobSkills", () => {
  beforeEach(() => {
    jobSkillsServiceMock.addJobSkill.mockReset();
    jobSkillsServiceMock.listJobSkills.mockReset();
    jobSkillsServiceMock.removeJobSkill.mockReset();
    jobSkillsServiceMock.updateJobSkill.mockReset();
    toastMock.warning.mockReset();
    toastMock.error.mockReset();
  });

  it("detecta skill já vinculada por nome normalizado", () => {
    expect(
      isSkillAlreadyLinked(
        [
          {
            skill_id: "skill-1",
            skill_name: " SQL Server ",
            priority_level: "priority",
            minimum_level: null,
            minimum_years: null,
            weight: 1,
          },
        ],
        "sql server",
      ),
    ).toBe(true);
  });

  it("não tenta adicionar skill duplicada e exibe aviso", async () => {
    const { result } = renderHook(() =>
      useJobSkills({
        currentJob: null,
        onRefreshQuality: vi.fn(),
      }),
    );

    act(() => {
      result.current.setPendingSkills([
        {
          skill_id: "skill-1",
          skill_name: "SQL Server",
          priority_level: "priority",
          minimum_level: null,
          minimum_years: null,
          weight: 1,
        },
      ]);
    });

    await act(async () => {
      await result.current.handleAddSkill(
        {
          id: "skill-2",
          canonical: "SQL Server",
          aliases: [],
          domains: [],
          type: "skill",
          strength: "strong",
        },
        "priority",
      );
    });

    expect(result.current.pendingSkills).toHaveLength(1);
    expect(jobSkillsServiceMock.addJobSkill).not.toHaveBeenCalled();
    expect(toastMock.warning).toHaveBeenCalledWith("Skill já vinculada a esta vaga.");
  });

  it("adiciona skill essencial livre preservando o texto e o priority_level", async () => {
    const { result } = renderHook(() =>
      useJobSkills({
        currentJob: null,
        onRefreshQuality: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleAddSkill("  Node.js  ", "priority");
    });

    expect(result.current.pendingSkills).toEqual([
      expect.objectContaining({
        skill_name: "Node.js",
        priority_level: "priority",
      }),
    ]);
  });

  it("envia priority_level complementar para a API ao adicionar diferencial", async () => {
    jobSkillsServiceMock.listJobSkills.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useJobSkills({
        currentJob: { id: "job-1" },
        onRefreshQuality: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleAddSkill(
        {
          id: "skill-2",
          canonical: "Docker",
          aliases: [],
          domains: [],
          type: "skill",
          strength: "strong",
        },
        "complementary",
      );
    });

    expect(jobSkillsServiceMock.addJobSkill).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        skill_name: "Docker",
        priority_level: "complementary",
      }),
    );
  });
});
