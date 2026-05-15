import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SimpleDonutChart } from "../SimpleDonutChart";

describe("SimpleDonutChart", () => {
  it("renderiza empty state sem dados", () => {
    render(<SimpleDonutChart ariaLabel="Distribuição vazia" data={[]} />);

    expect(screen.getAllByText("Sem dados")).toHaveLength(2);
  });

  it("renderiza labels da legenda", () => {
    render(
      <SimpleDonutChart
        ariaLabel="Distribuição por status"
        data={[
          { label: "Publicado", value: 8, color: "#111" },
          { label: "Pausado", value: 2, color: "#222" },
        ]}
      />,
    );

    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByText("Pausado")).toBeInTheDocument();
  });

  it("não quebra com valores zero", () => {
    render(
      <SimpleDonutChart
        ariaLabel="Distribuição com zeros"
        data={[
          { label: "Publicado", value: 0, color: "#111" },
          { label: "Pausado", value: 0, color: "#222" },
        ]}
      />,
    );

    expect(screen.getAllByText("Sem dados")).toHaveLength(2);
  });

  it("renderiza svg com aria-label", () => {
    render(
      <SimpleDonutChart
        ariaLabel="Distribuição acessível"
        data={[{ label: "Publicado", value: 4, color: "#111" }]}
      />,
    );

    expect(screen.getByRole("img", { name: "Distribuição acessível" })).toBeInTheDocument();
  });
});
