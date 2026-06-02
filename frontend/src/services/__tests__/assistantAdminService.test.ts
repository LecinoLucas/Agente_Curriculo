import { afterEach, describe, expect, it, vi } from "vitest";

const httpRequestMock = vi.fn();

vi.mock("../http", () => ({
  httpRequest: (...args: unknown[]) => httpRequestMock(...args),
}));

describe("assistantAdminService", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("listSessions calls correct endpoint without filters", async () => {
    httpRequestMock.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
    const { assistantAdminService } = await import("../assistantAdminService");

    await assistantAdminService.listSessions({});

    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/admin/assistant/sessions");
  });

  it("listSessions encodes filter params into query string", async () => {
    httpRequestMock.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
    const { assistantAdminService } = await import("../assistantAdminService");

    await assistantAdminService.listSessions({
      status: "active",
      current_state: "CHOOSE_LOCATION",
      channel: "web",
      has_application: true,
      has_pipeline: false,
      page: 2,
      page_size: 20,
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("status=active")
    );
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("current_state=CHOOSE_LOCATION")
    );
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("has_application=true")
    );
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("has_pipeline=false")
    );
    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("page=2")
    );
  });

  it("getSession calls correct endpoint with session_id", async () => {
    httpRequestMock.mockResolvedValue({ session_id: "sess-1" });
    const { assistantAdminService } = await import("../assistantAdminService");

    await assistantAdminService.getSession("sess-1");

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/assistant/sessions/sess-1"
    );
  });

  it("listMessages calls correct endpoint with session_id", async () => {
    httpRequestMock.mockResolvedValue([]);
    const { assistantAdminService } = await import("../assistantAdminService");

    await assistantAdminService.listMessages("sess-1");

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/assistant/sessions/sess-1/messages"
    );
  });

  it("listFailures calls correct endpoint without filters", async () => {
    httpRequestMock.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
    const { assistantAdminService } = await import("../assistantAdminService");

    await assistantAdminService.listFailures({});

    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/admin/assistant/failures");
  });

  it("listFailures encodes all filter params into query string", async () => {
    httpRequestMock.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
    const { assistantAdminService } = await import("../assistantAdminService");

    await assistantAdminService.listFailures({
      status: "open",
      reason: "location_not_found",
      classification: "location",
      state: "CHOOSE_LOCATION",
      session_id: "sess-1",
      has_candidate: true,
      has_application: false,
      from_date: "2026-06-01",
      to_date: "2026-06-30",
      page: 3,
    });

    const url = httpRequestMock.mock.calls[0][0] as string;
    expect(url).toContain("status=open");
    expect(url).toContain("reason=location_not_found");
    expect(url).toContain("classification=location");
    expect(url).toContain("state=CHOOSE_LOCATION");
    expect(url).toContain("session_id=sess-1");
    expect(url).toContain("has_candidate=true");
    expect(url).toContain("has_application=false");
    expect(url).toContain("from_date=2026-06-01");
    expect(url).toContain("to_date=2026-06-30");
    expect(url).toContain("page=3");
  });

  it("getFailure calls correct endpoint with failure_id", async () => {
    httpRequestMock.mockResolvedValue({ id: "fail-1" });
    const { assistantAdminService } = await import("../assistantAdminService");

    await assistantAdminService.getFailure("fail-1");

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/assistant/failures/fail-1"
    );
  });

  it("updateFailure sends a PATCH with status and classification", async () => {
    httpRequestMock.mockResolvedValue({ id: "fail-1", status: "reviewed" });
    const { assistantAdminService } = await import("../assistantAdminService");

    await assistantAdminService.updateFailure("fail-1", {
      status: "reviewed",
      classification: "talk_to_hr",
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/assistant/failures/fail-1",
      { method: "PATCH", body: { status: "reviewed", classification: "talk_to_hr" } }
    );
  });
});
