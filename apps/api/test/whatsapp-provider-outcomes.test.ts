import { describe, expect, it, vi } from "vitest";
import { createMetaCloudProvider } from "../src/modules/notifications/providers/meta-cloud-provider.js";
import { classifyMetaReply } from "../src/modules/notifications/providers/meta-cloud-result.js";
import { syntheticAccount, syntheticInput, acceptedResponse } from "./whatsapp-provider-fixture.js";

describe("Meta provider response classification and uncertain dispatch", () => {
  it("distinguishes accepted from delivered and treats malformed 2xx as UNKNOWN", () => {
    expect(classifyMetaReply(200, {
      messaging_product: "whatsapp", messages: [{ id: "wamid.test123" }],
    }, null)).toEqual({ kind: "ACCEPTED", providerMessageId: "wamid.test123" });
    for (const response of [null, {}, { messages: [{ id: "not-a-meta-id" }] },
      { messaging_product: "whatsapp", messages: [] }]) {
      expect(classifyMetaReply(200, response, null)).toEqual({
        kind: "UNKNOWN", reason: "MALFORMED_RESPONSE",
      });
    }
  });

  it("uses narrowly allowlisted rejection codes; 5xx/unknown codes never retry", () => {
    const cases = [
      [400, 130429, { kind: "NOT_ACCEPTED", reason: "RATE_LIMIT", retryAfterSeconds: 90 }],
      [400, 80007, { kind: "NOT_ACCEPTED", reason: "RATE_LIMIT", retryAfterSeconds: 90 }],
      [429, 130429, { kind: "NOT_ACCEPTED", reason: "RATE_LIMIT", retryAfterSeconds: 90 }],
      [400, 131026, { kind: "PERMANENT", reason: "RECIPIENT" }],
      [400, 132001, { kind: "PERMANENT", reason: "TEMPLATE" }],
      [401, 190, { kind: "PERMANENT", reason: "AUTH" }],
      [400, 131047, { kind: "PERMANENT", reason: "POLICY" }],
      [500, 130429, { kind: "UNKNOWN", reason: "TRANSPORT" }],
      [429, 9999999, { kind: "UNKNOWN", reason: "TRANSPORT" }],
    ] as const;
    for (const [status, code, expected] of cases) {
      expect(classifyMetaReply(status, { error: { code } }, "90")).toEqual(expected);
    }
    expect(classifyMetaReply(429, { error: { code: 130429 } }, "999999"))
      .toEqual({ kind: "NOT_ACCEPTED", reason: "RATE_LIMIT" });
    expect(classifyMetaReply(502, { message: "secret" }, null))
      .toEqual({ kind: "UNKNOWN", reason: "MALFORMED_RESPONSE" });
  });

  it("returns UNKNOWN on drop, redirect, malformed JSON and oversized body, with one HTTP attempt", async () => {
    const samples = [
      async () => { throw new Error("network reset after provider acceptance"); },
      async () => new Response("", { status: 302, headers: { Location: "https://evil.test" } }),
      async () => new Response("not-json", { status: 200 }),
      async () => new Response("x".repeat(9000), { status: 200 }),
    ];
    for (const response of samples) {
      const fetcher = vi.fn(response);
      const provider = createMetaCloudProvider({
        resolveAuthorizedAttempt: async () => syntheticAccount(), mode: "test",
        globallyEnabled: true, fetchImpl: fetcher as typeof fetch,
      });
      const result = await provider.send(syntheticInput());
      expect(result.kind).toBe("UNKNOWN");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("terminates one pending fetch after 10 seconds without HTTP replay", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      });
      const provider = createMetaCloudProvider({
        resolveAuthorizedAttempt: async () => syntheticAccount(), mode: "test",
        globallyEnabled: true, fetchImpl: fetcher as typeof fetch,
      });
      const pending = provider.send(syntheticInput());
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await pending).toEqual({ kind: "UNKNOWN", reason: "TIMEOUT" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("does not leak raw responses, tokens or phone numbers through result classes", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: {
      code: 999, message: "synthetic-meta-test-credential +962790000001 secret",
    } }), { status: 400 }));
    const provider = createMetaCloudProvider({
      resolveAuthorizedAttempt: async () => syntheticAccount(), mode: "test",
      globallyEnabled: true, fetchImpl: fetcher,
    });
    const value = await provider.send(syntheticInput());
    expect(value).toEqual({ kind: "UNKNOWN", reason: "TRANSPORT" });
    expect(JSON.stringify(value)).not.toContain("synthetic-meta-test-credential");
    expect(JSON.stringify(value)).not.toContain("+962790000001");
  });

  it("handles ordinary success response in synthetic offline-only tests", async () => {
    const provider = createMetaCloudProvider({
      resolveAuthorizedAttempt: async () => syntheticAccount(), mode: "test",
      globallyEnabled: true, fetchImpl: vi.fn(async () => acceptedResponse()),
    });
    expect(await provider.send(syntheticInput())).toEqual({
      kind: "ACCEPTED", providerMessageId: "wamid.synthetic123",
    });
  });
});
