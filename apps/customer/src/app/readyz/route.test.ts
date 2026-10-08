import { afterEach, describe, expect, it, vi } from "vitest";

import { checkCustomerApiReadiness } from "../../lib/readiness/customer-readiness";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Customer readiness route", () => {
  it("checks the build-time API readiness endpoint and ignores runtime API_ORIGIN", async () => {
    vi.stubEnv("VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN", "https://api-build.example.test");
    vi.stubEnv("API_ORIGIN", "https://runtime-override.example.test");
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(checkCustomerApiReadiness(fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-build.example.test/health/ready",
      expect.objectContaining({
        cache: "no-store",
        method: "GET",
        redirect: "error",
      }),
    );
  });

  it("fails closed when the API is unreachable, malformed, or not ready", async () => {
    vi.stubEnv("VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN", "https://api.example.test");
    await expect(
      checkCustomerApiReadiness(vi.fn(async () => { throw new Error("offline"); })),
    ).resolves.toBe(false);
    await expect(
      checkCustomerApiReadiness(
        vi.fn(async () => new Response(JSON.stringify({ status: "unavailable" }), { status: 503 })),
      ),
    ).resolves.toBe(false);
    vi.stubEnv("VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN", "https://api.example.test/path");
    await expect(checkCustomerApiReadiness(vi.fn())).resolves.toBe(false);
  });

  it("bounds an API readiness check even when the transport never settles", async () => {
    vi.stubEnv("VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN", "https://api.example.test");
    const never = vi.fn(() => new Promise<Response>(() => {}));
    await expect(checkCustomerApiReadiness(never, 5)).resolves.toBe(false);
  });

  it("returns only generic non-cacheable 503 state when the API is unavailable", async () => {
    vi.stubEnv("VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN", "https://api.example.test");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    const { GET } = await import("./route");
    const response = GET();

    const settled = await response;
    expect(settled.status).toBe(503);
    expect(settled.headers.get("cache-control")).toBe("no-store");
    expect(await settled.json()).toEqual({ status: "unavailable" });
  });
});
