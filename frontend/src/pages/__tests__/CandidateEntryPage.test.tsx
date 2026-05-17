import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CandidateEntryPage } from "../CandidateEntryPage";

describe("CandidateEntryPage", () => {
  it("mantém os atalhos para cadastro e portal", () => {
    render(
      <MemoryRouter initialEntries={["/candidato"]}>
        <CandidateEntryPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /iniciar candidatura/i })).toHaveAttribute(
      "href",
      "/candidato/cadastro"
    );
    expect(screen.getByRole("link", { name: /entrar no portal/i })).toHaveAttribute(
      "href",
      "/candidato/login"
    );
  });
});
