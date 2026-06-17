import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErpPayloadPreview } from "../ErpPayloadPreview";
import type { ErpDryRunPayloadPreview } from "../../../../../types/domain";

describe("ErpPayloadPreview", () => {
  it("masks sensitive ERP payload data in summary and expanded JSON", () => {
    const payload: ErpDryRunPayloadPreview = {
      provider: "protheus",
      mode: "dry_run",
      candidate: {
        name: "Candidate ERP",
        email: "candidate@example.com",
        cpf: "123.456.789-90",
      },
      job: { title: "Backend Engineer", department: "Engineering" },
      admission: {
        start_date: "2026-06-01",
        salary_offer: 8500,
        work_model: "hybrid",
      },
      decision: { hiring_decision_id: "dec-1" },
      documents: [{ title: "CPF", status: "approved", document_id: "doc-1" }],
    };

    render(<ErpPayloadPreview payload={payload} />);

    expect(screen.getAllByText(/c\*\*\*@example.com/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\*\*\*\.\*\*\*\.\*\*\*-90/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Informado")).toBeInTheDocument();

    const rawPayload = screen.getByTestId("erp-payload-raw-json");
    expect(rawPayload).toHaveTextContent('"email": "c***@example.com"');
    expect(rawPayload).toHaveTextContent('"cpf": "***.***.***-90"');
    expect(rawPayload).toHaveTextContent('"salary_offer": "Informado"');
    expect(rawPayload).toHaveTextContent('"title": "Backend Engineer"');
    expect(rawPayload).not.toHaveTextContent("candidate@example.com");
    expect(rawPayload).not.toHaveTextContent("123.456.789-90");
    expect(rawPayload).not.toHaveTextContent('"salary_offer": 8500');
  });
});
