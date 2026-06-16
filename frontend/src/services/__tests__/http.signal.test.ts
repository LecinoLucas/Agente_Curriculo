/**
 * F-04 fix: httpRequest must forward external AbortSignal to the underlying fetch
 * and surface a DOMException("AbortError") when the caller cancels.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { httpRequest, HttpError } from "../http";

describe("httpRequest — signal support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves normally when signal is not provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await httpRequest<{ ok: boolean }>("/api/v1/test", {
      withAuth: false,
    });

    expect(result).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  it("passes the caller signal to fetch so the network request is cancellable", async () => {
    const callerController = new AbortController();

    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      // Verify signal is forwarded to fetch
      expect(init?.signal).toBeDefined();
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    await httpRequest<{ ok: boolean }>("/api/v1/test", {
      withAuth: false,
      signal: callerController.signal,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("surfaces DOMException AbortError when caller signal is aborted", async () => {
    const callerController = new AbortController();

    const mockFetch = vi.fn().mockImplementation(() => {
      // Simulate the fetch being aborted
      callerController.abort();
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      httpRequest("/api/v1/test", {
        withAuth: false,
        signal: callerController.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    vi.unstubAllGlobals();
  });

  it("surfaces HttpError(504) on timeout (not external abort)", async () => {
    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      // Simulate timeout: abort the internal signal without an external abort
      if (init?.signal) {
        // We can't directly trigger the internal timeout, so we simulate the
        // network-level abort error that fetch throws on abort
        return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
      }
      return Promise.reject(new Error("unreachable"));
    });
    vi.stubGlobal("fetch", mockFetch);

    // No external signal — the 504 path triggers via internal controller
    const result = httpRequest("/api/v1/test", { withAuth: false });
    await expect(result).rejects.toBeInstanceOf(HttpError);

    vi.unstubAllGlobals();
  });
});
