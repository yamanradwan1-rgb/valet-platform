import { afterEach, describe, expect, it, vi } from "vitest";
import { mapApiError } from "../src/common/http/api-errors";
import { retryIntakeSerialization } from "../src/modules/valet-sessions/intake-serialization-retry";

// Vitest does not replace node:timers/promises timers; adapt only this test's
// sleep to the controlled global clock, keeping the real retry policy intact.
vi.mock("node:timers/promises", () => ({
  setTimeout: (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
}));

const serializationAbort = () =>
  Object.assign(new Error("controlled abort"), { code: "40001" });
afterEach(() => vi.useRealTimers());

describe("bounded Intake serialization retry policy", () => {
  it("defers reentry after an abort and returns the actual successful result", async () => {
    vi.useFakeTimers();
    const result = { committed: true };
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(serializationAbort())
      .mockResolvedValue(result);
    const pending = retryIntakeSerialization(attempt);
    await vi.advanceTimersByTimeAsync(10);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(15);
    expect(await pending).toBe(result);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops at five attempts and at most 375ms scheduled backoff", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn().mockRejectedValue(serializationAbort());
    const pending = retryIntakeSerialization(attempt).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(375);
    const failure = await pending;
    expect(failure).toMatchObject({ code: "INTAKE_CONCURRENCY_CONFLICT" });
    expect(mapApiError(failure)).toMatchObject({
      code: "INTAKE_CONCURRENCY_CONFLICT",
      status: 409,
    });
    expect(attempt).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    "23505",
    "55P03",
    "57014",
    "ECONNRESET",
    "IDEMPOTENCY_CONFLICT",
    "ACTIVE_VALET_SESSION_CONFLICT",
  ])("does not retry %s", async (code) => {
    vi.useFakeTimers();
    const error = Object.assign(new Error("controlled non-retryable failure"), {
      code,
    });
    const attempt = vi.fn().mockRejectedValue(error);
    await expect(retryIntakeSerialization(attempt)).rejects.toBe(error);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
