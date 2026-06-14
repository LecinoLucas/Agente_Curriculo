import { expect, test } from "@playwright/test";

test.describe("Job AI Draft Skills E2E Flow", () => {
  const MOCK_JOB_ID = "00000000-0000-0000-0000-000000000001";
  const MOCK_DRAFT_RESPONSE = {
    draft: {
      title: "Desenvolvedor Fullstack Senior",
      area: "Tecnologia",
      seniority: "senior",
      work_model: "remote",
      unit: "São Paulo - SP",
      salary_min: 12000,
      salary_max: 18000,
      minimum_education_level: "superior_completo",
      minimum_years_experience: 5,
      experience_context: "Experiência com sistemas distribuídos e alta escala.",
      description: "Vaga para atuar em projetos críticos utilizando tecnologias modernas.",
      responsibilities: [
        "Desenvolver novas features",
        "Manter código legado",
        "Revisar PRs do time"
      ],
      requirements: [
        "React",
        "Node.js",
        "PostgreSQL"
      ],
      mandatory_skills: ["React", "Node.js"],
      nice_to_have_skills: ["Docker"],
      benefits: ["VR", "Plano de Saúde"],
      working_hours: "40h semanais",
      screening_questions: ["Qual seu tempo de experiência com React?"],
      pipeline_steps: ["Entrevista", "Teste Técnico"],
      matching_criteria: ["Experiência comprovada"],
      suggested_skills: [
        {
          name: "React",
          category: "Frontend",
          aliases: ["ReactJS", "React.js"],
          importance: "essential",
          source: "ai_suggested",
          catalog_status: "existing",
          catalog_skill_id: "skill-react-123",
          catalog_skill_name: "React",
          catalog_matched_by: ["React"],
          catalog_conflicts: []
        },
        {
          name: "API",
          category: "Backend",
          aliases: ["REST"],
          importance: "essential",
          source: "ai_suggested",
          catalog_status: "conflict",
          catalog_conflicts: ["API REST", "Integração de APIs"],
          catalog_matched_by: []
        },
        {
          name: "Atendimento Humanizado",
          category: "Soft Skills",
          aliases: ["Empatia"],
          description: "Capacidade de atender com clareza e empatia.",
          importance: "differential",
          source: "ai_suggested",
          catalog_status: "new",
          catalog_matched_by: [],
          catalog_conflicts: []
        }
      ],
      requires_manager_review: true,
      requires_behavioral_assessment: false
    },
    needs_review: [],
    source: { text_used: true, ocr_used: false, input_character_count: 100 },
    usage: { provider: "openai", model: "gpt-4", input_tokens: 100, output_tokens: 200, total_tokens: 300, estimated_cost: 0.01 }
  };

  test("deve validar o fluxo completo de skills sugeridas pela IA", async ({ page }) => {
    page.on("console", msg => {
      if (msg.type() === "error") console.log(`FE Error: ${msg.text()}`);
      else console.log(`FE Log: ${msg.text()}`);
    });

    // 1. Mocks de rede
    await page.route("**/api/v1/jobs/ai-draft/generate", async (route) => {
      await route.fulfill({ json: MOCK_DRAFT_RESPONSE });
    });

    await page.route("**/api/v1/skills?search=*", async (route) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get("search");
      if (search === "API REST") {
        await route.fulfill({
          json: {
            data: [{ id: "skill-api-rest", name: "API REST", normalized_name: "api rest", category: "Backend", aliases: [] }],
            total: 1
          }
        });
      } else if (search === "Integração de APIs") {
        await route.fulfill({
          json: {
            data: [{ id: "skill-integ-apis", name: "Integração de APIs", normalized_name: "integracao de apis", category: "Backend", aliases: [] }],
            total: 1
          }
        });
      } else {
        await route.fulfill({ json: { data: [], total: 0 } });
      }
    });

    await page.route("**/api/v1/skills/validate-suggestion", async (route) => {
      await route.fulfill({
        json: {
          allowed: true,
          conflicts: [],
          warnings: [],
          normalized_canonical: "atendimento humanizado",
          normalized_aliases: ["empatia"]
        }
      });
    });

    await page.route("**/api/v1/skills/approve-suggestion", async (route) => {
      await route.fulfill({
        json: {
          skill: { id: "skill-new-123", name: "Atendimento Humanizado", category: "Soft Skills", aliases: [] },
          warnings: [],
          validation: {
            allowed: true,
            conflicts: [],
            warnings: [],
            normalized_canonical: "atendimento humanizado",
            normalized_aliases: []
          }
        }
      });
    });

    let lastJobPayload: any = null;
    await page.route("**/api/v1/jobs", async (route) => {
      if (route.request().method() === "POST") {
        lastJobPayload = route.request().postDataJSON();
        await route.fulfill({ json: { id: MOCK_JOB_ID, ...lastJobPayload } });
      } else {
        await route.continue();
      }
    });

    const createdSkills: any[] = [];
    await page.route(`**/api/v1/jobs/${MOCK_JOB_ID}/skills`, async (route) => {
      if (route.request().method() === "POST") {
        createdSkills.push(route.request().postDataJSON());
        await route.fulfill({ json: { id: "skill-link-id", ...route.request().postDataJSON() } });
      } else if (route.request().method() === "GET") {
        await route.fulfill({ json: [] });
      } else {
        await route.continue();
      }
    });

    // 2. Início do teste
    await page.goto("/vagas/nova");
    await expect(page.getByRole("heading", { name: "Nova vaga" })).toBeVisible();

    // 3. Gerar com IA
    await page.getByRole("button", { name: /Preencher com IA/i }).click();
    await page.locator("#ai-draft-prompt").fill("Preciso de um desenvolvedor React e Node.");
    await page.getByTestId("ai-draft-generate-btn").click();

    // Aguarda o rascunho aparecer
    await expect(page.getByTestId("ai-draft-result")).toBeVisible();
    await expect(page.getByTestId("draft-suggested-skills")).toBeVisible();

    // 4. Revisar skills - Existing
    // React já deve estar selecionado por padrão
    const reactCheckbox = page.getByTestId("draft-suggested-skill-checkbox-existing-React");
    await expect(reactCheckbox).toBeChecked();

    // 5. Revisar skills - Conflict
    const apiCheckbox = page.getByTestId("draft-suggested-skill-checkbox-conflict-API");
    await apiCheckbox.check();
    
    // Seleciona a opção de resolução do conflito
    const apiOption = page.getByTestId("draft-suggested-skill-conflict-option-API-skill-api-rest");
    await apiOption.click();
    await expect(apiOption).toBeChecked();

    // 6. Revisar skills - New
    const humanizedCheckbox = page.getByTestId("draft-suggested-skill-checkbox-new-Atendimento Humanizado");
    await humanizedCheckbox.check();

    // Cenário D: Cancelamento no modal de aprovação
    await page.getByTestId("approve-suggested-skill-Atendimento Humanizado").click();
    await expect(page.getByTestId("job-ai-skill-approval-dialog")).toBeVisible();
    await page.getByTestId("job-ai-skill-approval-dialog").getByRole("button", { name: "Fechar" }).first().click();
    await expect(page.getByTestId("job-ai-skill-approval-dialog")).not.toBeVisible();

    // Aprova no catálogo (Cenário A)
    await page.getByTestId("approve-suggested-skill-Atendimento Humanizado").click();
    await expect(page.getByTestId("job-ai-skill-approval-dialog")).toBeVisible();
    await expect(page.getByTestId("approval-skill-confirm")).toBeEnabled();
    
    const approvePromise = page.waitForResponse("**/api/v1/skills/approve-suggestion");
    await page.getByTestId("approval-skill-confirm").click();
    await approvePromise;
    
    await expect(page.getByTestId("approval-skill-success")).toBeVisible();
    
    // Usar skill criada no formulário (adiciona ao payload de aplicação)
    await page.getByTestId("approval-skill-apply-to-form").click();
    await page.getByTestId("job-ai-skill-approval-dialog").getByRole("button", { name: "Fechar" }).first().click();

    // Cenário D: Cancelamento no modal de aplicação do rascunho
    await page.getByTestId("ai-draft-apply-btn").click();
    await expect(page.getByTestId("job-ai-apply-confirmation-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("job-ai-apply-confirmation-dialog")).not.toBeVisible();

    // 7. Aplicar ao formulário (Fluxo feliz)
    await page.getByTestId("ai-draft-apply-btn").click();
    await expect(page.getByTestId("job-ai-apply-confirmation-dialog")).toBeVisible();
    
    // Confirma aplicação
    await page.getByRole("button", { name: "Aplicar rascunho" }).click();
    await expect(page.getByTestId("ai-draft-result")).not.toBeVisible();

    // 8. Validar campos preenchidos no formulário
    await expect(page.getByLabel("Título da vaga *")).toHaveValue("Desenvolvedor Fullstack Senior");
    
    // Navega para aba de skills
    await page.getByRole("button", { name: "Skills" }).click();
    await expect(page.getByTestId("skills-subtabs-nav")).toBeVisible();
    
    // 9. Salvar vaga
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    
    // 10. Aguardar navegação para a página de edição (indica que o sync terminou)
    await page.waitForURL(`**/vagas/${MOCK_JOB_ID}/editar`);
    
    // 11. Validar payload de criação
    expect(lastJobPayload).not.toBeNull();
    expect(lastJobPayload.title).toBe("Desenvolvedor Fullstack Senior");
    expect(lastJobPayload.suggested_skills).toBeUndefined();
    expect(lastJobPayload.catalog_conflicts).toBeUndefined();
    
    // 12. Validar skills estruturadas enviadas separadamente
    // Devem ter sido enviados: React, API REST, Atendimento Humanizado
    const skillNames = createdSkills.map(s => s.skill_name);
    console.log("Created Skills:", skillNames);
    expect(skillNames).toContain("React");
    expect(skillNames).toContain("API REST");
    expect(skillNames).toContain("Atendimento Humanizado");
  });

  test("deve exigir confirmação de warnings para aprovar skill", async ({ page }) => {
    await page.route("**/api/v1/jobs/ai-draft/generate", async (route) => {
      await route.fulfill({ json: MOCK_DRAFT_RESPONSE });
    });

    await page.route("**/api/v1/skills/validate-suggestion", async (route) => {
      await route.fulfill({
        json: {
          allowed: true,
          conflicts: [],
          warnings: [{
            type: "canonical_matches_existing_alias",
            field: "canonical",
            value: "Skill Com Warning",
            message: "Já existe uma skill com este alias.",
            existing_skill_name: "Outra Skill"
          }],
          normalized_canonical: "skill com warning",
          normalized_aliases: []
        }
      });
    });

    await page.goto("/vagas/nova");
    await page.getByRole("button", { name: /Preencher com IA/i }).click();
    await page.locator("#ai-draft-prompt").fill("Qualquer coisa");
    await page.getByTestId("ai-draft-generate-btn").click();

    await page.getByTestId("approve-suggested-skill-Atendimento Humanizado").click();
    await expect(page.getByTestId("approval-skill-warnings")).toBeVisible();
    
    // Botão deve estar desabilitado sem o checkbox
    await expect(page.getByTestId("approval-skill-confirm")).toBeDisabled();

    // Marca o checkbox
    await page.getByTestId("approval-skill-confirm-warnings").check();
    await expect(page.getByTestId("approval-skill-confirm")).toBeEnabled();
  });

  test("deve bloquear aprovação de skill nova por conflito de guardrail", async ({ page }) => {
    // Mock de rascunho com uma skill nova que vai conflitar
    await page.route("**/api/v1/jobs/ai-draft/generate", async (route) => {
      await route.fulfill({ json: MOCK_DRAFT_RESPONSE });
    });

    await page.route("**/api/v1/skills/validate-suggestion", async (route) => {
      await route.fulfill({
        json: {
          allowed: false,
          conflicts: [{
            type: "canonical_collision",
            field: "canonical",
            value: "React",
            normalized_value: "react",
            message: "Já existe uma skill com este nome.",
            existing_skill_name: "React"
          }],
          warnings: [],
          normalized_canonical: "react",
          normalized_aliases: []
        }
      });
    });

    await page.goto("/vagas/nova");
    await page.getByRole("button", { name: /Preencher com IA/i }).click();
    await page.locator("#ai-draft-prompt").fill("Qualquer coisa");
    await page.getByTestId("ai-draft-generate-btn").click();

    await page.getByTestId("approve-suggested-skill-Atendimento Humanizado").click();
    await expect(page.getByTestId("approval-skill-conflicts")).toBeVisible();
    await expect(page.getByTestId("approval-skill-confirm")).toBeDisabled();
  });
});
