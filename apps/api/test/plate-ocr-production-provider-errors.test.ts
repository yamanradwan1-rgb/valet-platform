import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authority,
  image,
  input,
  scope,
  session,
  setup,
} from "./plate-ocr-direct-service-fixture";

beforeEach(() => {
  authority.session
    .mockReset()
    .mockResolvedValue({ id: session.staffAuthSessionId });
  authority.location.mockReset().mockResolvedValue(scope);
  authority.shift.mockReset().mockResolvedValue({ shiftId: "active-shift" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("production direct OCR provider failures", () => {
  it.each([
    [
      "HTTP 429",
      () => Promise.resolve(new Response("rate limited", { status: 429 })),
    ],
    ["network failure", () => Promise.reject(new Error("offline"))],
  ])(
    "returns UNAVAILABLE on %s without paid retry",
    async (_reason, outcome) => {
      const http = vi.fn<typeof fetch>().mockImplementation(outcome);
      const c = setup(http);
      expect(
        await c.service.recognize(
          session,
          input,
          image,
          new AbortController().signal,
        ),
      ).toEqual({ status: "UNAVAILABLE" });
      expect(http).toHaveBeenCalledOnce();
    },
  );

  it("times out an unresponsive provider without automatic retry", async () => {
    vi.useFakeTimers();
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const c = setup(http);
    const pending = c.service.recognize(
      session,
      input,
      image,
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(http).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(110);
    expect(await pending).toEqual({ status: "UNAVAILABLE" });
    expect(http).toHaveBeenCalledOnce();
  });
});
