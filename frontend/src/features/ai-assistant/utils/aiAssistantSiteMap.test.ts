import { describe, it, expect } from "vitest";
import { searchSiteMap } from "./aiAssistantSiteMap";

describe("aiAssistantSiteMap", () => {
  it("tenho tela de vagas? retorna vagas e nova vaga", () => {
    const results = searchSiteMap("tenho tela de vagas?");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.path === "/vagas")).toBe(true);
    expect(results.some(r => r.path === "/vagas/nova")).toBe(true);
  });

  it("qual tela eu crio vaga? retorna nova vaga", () => {
    const results = searchSiteMap("qual tela eu crio vaga?");
    expect(results.some(r => r.path === "/vagas/nova")).toBe(true);
  });

  it("onde cadastrar vaga? retorna nova vaga", () => {
    const results = searchSiteMap("onde cadastrar vaga?");
    expect(results.some(r => r.path === "/vagas/nova")).toBe(true);
  });

  it("onde vejo vagas? retorna lista de vagas", () => {
    const results = searchSiteMap("onde vejo vagas?");
    expect(results.some(r => r.path === "/vagas")).toBe(true);
  });

  it("tenho tela de candidatos? retorna candidatos e importação", () => {
    const results = searchSiteMap("tenho tela de candidatos?");
    expect(results.some(r => r.path === "/candidatos")).toBe(true);
    expect(results.some(r => r.path === "/importar")).toBe(true);
  });

  it("tenho tela de pipeline? retorna pipeline", () => {
    const results = searchSiteMap("tenho tela de pipeline?");
    expect(results.some(r => r.path === "/pipeline")).toBe(true);
  });

  it("tenho tela de admissão? retorna admissão", () => {
    const results = searchSiteMap("tenho tela de admissão?");
    expect(results.some(r => r.path === "/admitidos")).toBe(true);
  });

  it("tenho tela de base de conhecimento? retorna conhecimento", () => {
    const results = searchSiteMap("tenho tela de base de conhecimento?");
    expect(results.some(r => r.path === "/admin/conhecimento")).toBe(true);
  });

  it("tenho tela de IA? retorna configs de ia", () => {
    const results = searchSiteMap("tenho tela de IA?");
    expect(results.some(r => r.path === "/admin/ia" || r.path === "/admin/ai-provider-credentials")).toBe(true);
  });

  it("tenho tela de auditoria? retorna auditoria", () => {
    const results = searchSiteMap("tenho tela de auditoria?");
    expect(results.some(r => r.path === "/admin/auditoria")).toBe(true);
  });

  it("quais telas existem? retorna visão geral por grupos (lista completa)", () => {
    const results = searchSiteMap("quais telas existem?");
    expect(results.length).toBeGreaterThan(10);
  });
});
