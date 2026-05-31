import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CandidatePortalRedirectPage } from "../CandidatePortalRedirectPage";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <Routes>
        <Route path={path} element={<CandidatePortalRedirectPage />} />
        <Route path="/candidato/*" element={<CandidatePortalRedirectPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CandidatePortalRedirectPage", () => {
  it("exibe a tela de transição em /candidato", () => {
    renderAt("/candidato");
    expect(screen.getByText(/portal do candidato foi atualizado/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /acessar novo portal/i })).toBeInTheDocument();
  });

  it("exibe a tela de transição em /candidato/cadastro", () => {
    renderAt("/candidato/cadastro");
    expect(screen.getByRole("link", { name: /acessar novo portal/i })).toBeInTheDocument();
  });

  it("exibe a tela de transição em /candidato/login", () => {
    renderAt("/candidato/login");
    expect(screen.getByRole("link", { name: /acessar novo portal/i })).toBeInTheDocument();
  });

  it("exibe a tela de transição em /candidato/portal", () => {
    renderAt("/candidato/portal");
    expect(screen.getByRole("link", { name: /acessar novo portal/i })).toBeInTheDocument();
  });

  it("exibe a tela de transição em /candidato/pre-admissao", () => {
    renderAt("/candidato/pre-admissao");
    expect(screen.getByRole("link", { name: /acessar novo portal/i })).toBeInTheDocument();
  });

  it("CTA aponta para o fallback http://localhost:5174/vagas quando env não está definido", () => {
    renderAt("/candidato");
    const link = screen.getByRole("link", { name: /acessar novo portal/i });
    // VITE_CANDIDATE_PORTAL_URL is undefined in test env → fallback http://localhost:5174
    expect(link).toHaveAttribute("href", expect.stringContaining("localhost:5174"));
  });

  it("CTA de /candidato/login aponta para /login no novo portal", () => {
    renderAt("/candidato/login");
    const link = screen.getByRole("link", { name: /acessar novo portal/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/login"));
  });

  it("CTA de /candidato/portal aponta para /minha-area no novo portal", () => {
    renderAt("/candidato/portal");
    const link = screen.getByRole("link", { name: /acessar novo portal/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/minha-area"));
  });

  it("CTA de /candidato/pre-admissao aponta para /pre-admissao no novo portal", () => {
    renderAt("/candidato/pre-admissao");
    const link = screen.getByRole("link", { name: /acessar novo portal/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/pre-admissao"));
  });
});
