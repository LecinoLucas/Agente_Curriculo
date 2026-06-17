import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreAdmissionEventTimeline } from "../PreAdmissionEventTimeline";
import type { PreAdmissionEvent } from "../../../../../types/domain";

describe("PreAdmissionEventTimeline", () => {
  it("redacts sensitive payload_json before rendering event details", () => {
    const events: PreAdmissionEvent[] = [
      {
        id: "event-1",
        case_id: "case-1",
        event_type: "case_updated",
        actor_id: "user-1",
        created_at: "2026-06-01T10:00:00Z",
        payload_json: {
          provider: "protheus",
          candidate_email: "candidate@example.com",
          candidate_cpf: "123.456.789-90",
          salary_offer: 8500,
          job_title: "Backend Engineer",
        },
      },
    ];

    render(<PreAdmissionEventTimeline events={events} />);

    const eventJson = screen.getByText(/"provider": "protheus"/i);
    expect(eventJson).toHaveTextContent('"candidate_email": "c***@example.com"');
    expect(eventJson).toHaveTextContent('"candidate_cpf": "***.***.***-90"');
    expect(eventJson).toHaveTextContent('"salary_offer": "Informado"');
    expect(eventJson).toHaveTextContent('"job_title": "Backend Engineer"');
    expect(eventJson).not.toHaveTextContent("candidate@example.com");
    expect(eventJson).not.toHaveTextContent("123.456.789-90");
    expect(eventJson).not.toHaveTextContent('"salary_offer": 8500');
  });
});
