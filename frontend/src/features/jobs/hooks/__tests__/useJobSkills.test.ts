import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { jobSkillsServiceMock, skillsServiceMock, toastMock } = vi.hoisted(() => ({
  jobSkillsServiceMock: {
    addJobSkill: vi.fn(),
    listJobSkills: vi.fn(),
    removeJobSkill: vi.fn(),
    updateJobSkill: vi.fn(),
  },
  skillsServiceMock: {
    listSkills: vi.fn(),
  },
  toastMock: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../../services/jobSkillsService", () => ({
  jobSkillsService: jobSkillsServiceMock,
}));

vi.mock("../../../../services/skillsService", () => ({
  skillsService: skillsServiceMock,
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
    skillsServiceMock.listSkills.mockReset();
    skillsServiceMock.listSkills.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    });
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
          name: "SQL Server",
          normalized_name: "sql server",
          category: null,
          catalog_type: null,
          description: null,
          is_active: true,
          updated_at: "2026-05-13T00:00:00Z",
          archived_at: null,
          archived_by: null,
          archive_reason: null,
          archive_reason_note: null,
          created_at: "2026-05-13T00:00:00Z",
          aliases: [],
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
          name: "Docker",
          normalized_name: "docker",
          category: null,
          catalog_type: null,
          description: null,
          is_active: true,
          updated_at: "2026-05-13T00:00:00Z",
          archived_at: null,
          archived_by: null,
          archive_reason: null,
          archive_reason_note: null,
          created_at: "2026-05-13T00:00:00Z",
          aliases: [],
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

  it("atualiza skill persistida usando o vínculo existente", async () => {
    jobSkillsServiceMock.listJobSkills.mockResolvedValue([
      {
        id: "link-1",
        job_id: "job-1",
        skill_id: "skill-1",
        skill_name: "React",
        priority_level: "priority",
        minimum_level: null,
        minimum_years: null,
        weight: 1,
      },
    ]);
    const onRefreshQuality = vi.fn();

    const { result } = renderHook(() =>
      useJobSkills({
        currentJob: { id: "job-1" },
        onRefreshQuality,
      }),
    );

    const skill = {
      id: "link-1",
      job_id: "job-1",
      skill_id: "skill-1",
      skill_name: "React",
      priority_level: "complementary" as const,
      minimum_level: null,
      minimum_years: null,
      weight: 1,
    };

    await act(async () => {
      await result.current.handleUpdateSkill(skill, { priority_level: "priority" });
    });

    expect(jobSkillsServiceMock.updateJobSkill).toHaveBeenCalledWith(
      "job-1",
      skill,
      expect.objectContaining({
        priority_level: "priority",
      }),
    );
    expect(jobSkillsServiceMock.removeJobSkill).not.toHaveBeenCalled();
    expect(jobSkillsServiceMock.addJobSkill).not.toHaveBeenCalled();
    expect(onRefreshQuality).toHaveBeenCalledWith("job-1");
  });

  it("busca skills usando filtros de categoria e tipo", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() =>
        useJobSkills({
          currentJob: null,
          onRefreshQuality: vi.fn(),
        }),
      );

      act(() => {
        result.current.setSkillSearch("react");
        result.current.setSkillCategoryFilter("frontend");
        result.current.setSkillTypeFilter("tool");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(skillsServiceMock.listSkills).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "react",
          category: "frontend",
          catalog_type: "tool",
          is_active: true,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
