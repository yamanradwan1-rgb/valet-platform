import { afterEach, describe, expect, it, vi } from "vitest";

import { checkCustomerApiReadiness } from "../../lib/readiness/customer-readiness";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("T4 Customer readiness concurrent work", () => {
  it("coalesces 100 simultaneous calls to one real upstream check", async () => {
    vi.stubEnv(
      "VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN",
      "https://api.example.test",
    );
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const fetcher = vi.fn(async () => {
      await pending;
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    });
    const checks = Array.from({ length: 100 }, () =>
      checkCustomerApiReadiness(fetcher),
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    complete();
    expect(await Promise.all(checks)).toEqual(Array(100).fill(true));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not permanently cache readiness across success, failure, success waves", async () => {
    vi.stubEnv(
      "VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN",
      "https://api.example.test",
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"status":"unavailable"}', { status: 503 }),
      )
      .mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    expect(await checkCustomerApiReadiness(fetcher)).toBe(true);
    expect(await checkCustomerApiReadiness(fetcher)).toBe(false);
    expect(await checkCustomerApiReadiness(fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("recovers all waiters after a bounded timeout, even when fetch ignores abort", async () => {
    vi.stubEnv(
      "VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN",
      "https://api.example.test",
    );
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>(() => undefined))
      .mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    const calls = Array.from({ length: 100 }, () =>
      checkCustomerApiReadiness(fetcher, 15),
    );
    expect(await Promise.all(calls)).toEqual(Array(100).fill(false));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await checkCustomerApiReadiness(fetcher, 15)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects waiters above the bounded 128-caller limit without new probes", async () => {
    vi.stubEnv(
      "VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN",
      "https://api.example.test",
    );
    let resolve!: () => void;
    const gate = new Promise<void>((done) => {
      resolve = done;
    });
    const fetcher = vi.fn(async () => {
      await gate;
      return new Response('{"status":"ok"}', { status: 200 });
    });
    const calls = Array.from({ length: 200 }, () =>
      checkCustomerApiReadiness(fetcher),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve();
    const results = await Promise.all(calls);
    expect(results.filter(Boolean)).toHaveLength(128);
    expect(results.filter((result) => !result)).toHaveLength(72);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects changed origin while pending and fences stale success", async () => {
    vi.stubEnv(
      "VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN",
      "https://api.example.test",
    );
    let resolve!: () => void;
    const gate = new Promise<void>((done) => {
      resolve = done;
    });
    const fetcher = vi.fn(async () => {
      await gate;
      return new Response('{"status":"ok"}', { status: 200 });
    });
    const calls = Array.from({ length: 100 }, () =>
      checkCustomerApiReadiness(fetcher),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.stubEnv(
      "VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN",
      "https://other.example.test",
    );
    expect(await checkCustomerApiReadiness(fetcher)).toBe(false);
    resolve();
    const results = await Promise.all(calls);
    expect(results.every((result) => result === false)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the real route generic/no-store for 100 coalesced requests", async () => {
    vi.stubEnv(
      "VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN",
      "https://api.example.test",
    );
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        await pending;
        return new Response('{"status":"ok"}', { status: 200 });
      });
    const { GET } = await import("./route");
    const calls = Array.from({ length: 100 }, () => GET());
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish();
    const responses = await Promise.all(calls);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ status: "ready" });
    }
  });
});
