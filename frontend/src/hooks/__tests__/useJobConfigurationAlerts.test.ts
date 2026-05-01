/**
 * Tests for useJobConfigurationAlerts hook
 *
 * Validates that job configuration restrictiveness alerts are accurate
 * and help prevent false negatives from overly restrictive jobs.
 */

import { renderHook } from "@testing-library/react";
import { useJobConfigurationAlerts, type RestrictivenessLevel } from "../useJobConfigurationAlerts";

describe("useJobConfigurationAlerts", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: Low Restrictiveness
  // ─────────────────────────────────────────────────────────────────────────────

  it("should show LOW restrictiveness for realistic job", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Backend Developer",
        description: "Build scalable APIs with Python and PostgreSQL",
        job_area: "Tecnologia",
        responsibilities: "Develop and maintain APIs",
        experience_context: "Work with modern Python stacks",
        behavioral_requirements: ["Communication", "Autonomy"],
        minimum_education_level: "bachelor",
        minimum_years_experience: 3,
        deal_breakers: [
          {
            field: "work_model",
            operator: "equals",
            value: "remote",
            reason: "Remote only",
            is_active: true,
          },
        ],
      })
    );

    expect(result.current.summary.restrictiveness).toBe("low");
    expect(result.current.alerts).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("MUITO restritiva") })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Moderate Restrictiveness
  // ─────────────────────────────────────────────────────────────────────────────

  it("should show MODERATE restrictiveness for job with 6 years experience", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Senior Data Analyst",
        description: "Analyze complex datasets and create dashboards",
        job_area: "Dados",
        responsibilities: "Create analytics dashboards",
        experience_context: "Work with large datasets",
        behavioral_requirements: ["Analytical thinking"],
        minimum_education_level: "bachelor",
        minimum_years_experience: 6,
        deal_breakers: [{ field: "location", operator: "equals", value: "SP", reason: "", is_active: true }],
      })
    );

    expect(result.current.summary.restrictiveness).toMatch(/moderate|high/);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: High Restrictiveness
  // ─────────────────────────────────────────────────────────────────────────────

  it("should show HIGH restrictiveness for job with 8+ years + master degree", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Lead Data Scientist",
        description: "Lead data science initiatives",
        job_area: "Dados",
        responsibilities: "Lead team",
        experience_context: "10+ years experience",
        behavioral_requirements: ["Leadership"],
        minimum_education_level: "master",
        minimum_years_experience: 8,
        deal_breakers: [
          {
            field: "languages",
            operator: "contains",
            value: "english_fluent",
            reason: "International team",
            is_active: true,
          },
        ],
      })
    );

    expect(result.current.summary.restrictiveness).toMatch(/high|very_high/);

    // Should warn about master degree
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("Educação mínima alta"),
        level: "warning",
      })
    );

    // Should warn about high experience
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("Experiência mínima muito alta"),
        level: "warning",
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: Very High Restrictiveness
  // ─────────────────────────────────────────────────────────────────────────────

  it("should show VERY_HIGH restrictiveness with 10 years + master + 4 deal-breakers", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Principal Engineer",
        description: "Lead technical strategy",
        job_area: "Tecnologia",
        responsibilities: "Technical leadership",
        experience_context: "Extensive experience",
        behavioral_requirements: ["Leadership", "Strategic thinking"],
        minimum_education_level: "phd",
        minimum_years_experience: 10,
        deal_breakers: [
          {
            field: "languages",
            operator: "contains",
            value: "english_native",
            reason: "US-based team",
            is_active: true,
          },
          {
            field: "availability",
            operator: "equals",
            value: "immediate",
            reason: "Need immediate start",
            is_active: true,
          },
          {
            field: "location",
            operator: "equals",
            value: "SF",
            reason: "Office required",
            is_active: true,
          },
          {
            field: "experience_with_startup",
            operator: "equals",
            value: "yes",
            reason: "Startup experience required",
            is_active: true,
          },
        ],
      })
    );

    expect(result.current.summary.restrictiveness).toBe("very_high");

    // Should have warning about VERY_HIGH restrictiveness
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("MUITO restritiva"),
        icon: "⛔",
      })
    );

    // Should warn about suspicious deal-breakers (language, availability)
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("potencialmente inapropriado"),
        icon: "🚨",
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: Deal-breaker Detection
  // ─────────────────────────────────────────────────────────────────────────────

  it("should flag suspicious deal-breakers (language, availability)", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Developer",
        description: "Build software",
        job_area: "Tecnologia",
        minimum_years_experience: 3,
        deal_breakers: [
          {
            field: "english_fluency",
            operator: "equals",
            value: "advanced",
            reason: "International team",
            is_active: true,
          },
          {
            field: "availability",
            operator: "equals",
            value: "immediate",
            reason: "Need now",
            is_active: true,
          },
        ],
      })
    );

    // Should alert about suspicious deal-breakers
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("idioma"),
        category: "restrictiveness",
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 6: Too Many Deal-breakers
  // ─────────────────────────────────────────────────────────────────────────────

  it("should warn when 3+ deal-breakers are active", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Developer",
        description: "Build software",
        job_area: "Tecnologia",
        minimum_years_experience: 3,
        deal_breakers: [
          { field: "location", operator: "equals", value: "SP", reason: "", is_active: true },
          { field: "work_model", operator: "equals", value: "office", reason: "", is_active: true },
          { field: "salary_range", operator: "equals", value: "100k-120k", reason: "", is_active: true },
        ],
      })
    );

    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("3 critério"),
        level: "warning",
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 7: Completeness Checks (Critical)
  // ─────────────────────────────────────────────────────────────────────────────

  it("should mark as CRITICAL if title is missing", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "",
        description: "Build software systems",
      })
    );

    expect(result.current.summary.publishReadiness).toBe("critical");
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("Título é obrigatório"),
        level: "critical",
      })
    );
  });

  it("should mark as CRITICAL if description is too short", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Developer",
        description: "Build", // < 30 chars
      })
    );

    expect(result.current.summary.publishReadiness).toBe("critical");
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        level: "critical",
        message: expect.stringContaining("muito curta"),
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 8: Ready Status
  // ─────────────────────────────────────────────────────────────────────────────

  it("should show READY status when all critical checks pass", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Backend Engineer",
        description: "Build scalable backend systems with Python and PostgreSQL",
        job_area: "Tecnologia",
        responsibilities: "Develop APIs",
        minimum_years_experience: 3,
      })
    );

    expect(result.current.summary.publishReadiness).toBe("ready");
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        level: "success",
        message: expect.stringContaining("pronta para publicação"),
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 9: Microcopy for Skills
  // ─────────────────────────────────────────────────────────────────────────────

  it("should include category information in alerts", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Data Analyst",
        description: "Analyze business data and create reports",
        job_area: "Dados",
        minimum_years_experience: 8,
        deal_breakers: [
          {
            field: "english_fluency",
            operator: "equals",
            value: "advanced",
            reason: "Team language",
            is_active: true,
          },
        ],
      })
    );

    // All non-critical alerts should have category
    result.current.alerts
      .filter((a) => a.level !== "critical")
      .forEach((alert) => {
        expect(alert.category).toBeDefined();
      });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: Simulate the false negative scenario from bug report
// ─────────────────────────────────────────────────────────────────────────────

describe("False Negative Prevention - Analista de Dados", () => {
  it("should flag as VERY_HIGH restrictiveness the problematic job config", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Analista de Dados Sênior",
        description: "Buscamos analista com Power BI avançado, ETL, modelagem...",
        job_area: "Dados",
        minimum_education_level: "master", // ← Problem: too restrictive
        minimum_years_experience: 10, // ← Problem: too restrictive
        deal_breakers: [
          {
            field: "languages",
            operator: "contains",
            value: "english_advanced",
            reason: "International communications",
            is_active: true,
          },
          {
            field: "custom_requirement",
            operator: "equals",
            value: "ui_ux_knowledge",
            reason: "Must know UX/UI",
            is_active: true,
          },
          {
            field: "git_knowledge",
            operator: "equals",
            value: "required",
            reason: "Git required",
            is_active: true,
          },
        ],
      })
    );

    // Should be flagged as very high restrictiveness
    expect(result.current.summary.restrictiveness).toBe("very_high");

    // Should have VERY_HIGH warning
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("MUITO restritiva"),
      })
    );

    // Should warn about suspicious deal-breakers
    expect(result.current.alerts.some((a) => a.icon === "🚨")).toBe(true);

    // Should warn about Master degree requirement
    expect(result.current.alerts.some((a) => a.message.includes("Master"))).toBe(true);

    // Should warn about 10 years requirement
    expect(result.current.alerts.some((a) => a.message.includes("10 anos"))).toBe(true);
  });

  it("should show LOW restrictiveness for corrected job config", () => {
    const { result } = renderHook(() =>
      useJobConfigurationAlerts({
        title: "Analista de Dados Sênior",
        description: "Buscamos analista com Power BI avançado, ETL, modelagem...",
        job_area: "Dados",
        responsibilities: "Criar dashboards e pipelines de dados",
        experience_context: "Experiência com BI e análise de dados",
        behavioral_requirements: ["Análise crítica", "Comunicação"],
        minimum_education_level: "bachelor", // ← Fixed: realistic
        minimum_years_experience: 5, // ← Fixed: realistic
        deal_breakers: [], // ← Fixed: removed inappropriate restrictions
      })
    );

    // Should be LOW or MODERATE
    expect(result.current.summary.restrictiveness).toMatch(/low|moderate/);

    // Should have SUCCESS message
    expect(result.current.alerts).toContainEqual(
      expect.objectContaining({
        level: "success",
      })
    );

    // Should NOT have very_high warnings
    expect(result.current.alerts.filter((a) => a.message.includes("MUITO"))).toHaveLength(0);
  });
});
