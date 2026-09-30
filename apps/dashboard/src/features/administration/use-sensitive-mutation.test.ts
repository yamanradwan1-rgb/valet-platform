import { describe, expect, it, vi } from "vitest";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { executeSensitiveMutation } from "./sensitive-mutation-executor";

function callbacks(current: () => boolean) {
  return {
    isCurrent: current,
    onConflict: vi.fn(),
    onError: vi.fn(),
    onMfaRequired: vi.fn(),
    onSuccess: vi.fn(),
  };
}

describe("sensitive mutation callback fencing", () => {
  it("suppresses a committed late success after its UI intent becomes stale", async () => {
    let current = true;
    const operation = vi.fn(async () => {
      current = false;
      return { id: "committed" };
    });
    const effects = callbacks(() => current);

    await executeSensitiveMutation(operation, effects);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(effects.onSuccess).not.toHaveBeenCalled();
    expect(effects.onError).not.toHaveBeenCalled();
    expect(effects.onConflict).not.toHaveBeenCalled();
    expect(effects.onMfaRequired).not.toHaveBeenCalled();
  });

  it.each([
    ["error", new Error("late failure")],
    [
      "conflict",
      new DashboardApiError({
        code: "CONFLICT",
        kind: "conflict",
        message: "late conflict",
        status: 409,
      }),
    ],
    [
      "mfa",
      new DashboardApiError({
        code: "MFA_REQUIRED",
        kind: "mfa",
        message: "late mfa",
        status: 403,
      }),
    ],
  ])("suppresses stale %s callbacks without replay", async (_label, reason) => {
    let current = true;
    const operation = vi.fn(async () => {
      current = false;
      throw reason;
    });
    const effects = callbacks(() => current);

    await executeSensitiveMutation(operation, effects);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(effects.onSuccess).not.toHaveBeenCalled();
    expect(effects.onError).not.toHaveBeenCalled();
    expect(effects.onConflict).not.toHaveBeenCalled();
    expect(effects.onMfaRequired).not.toHaveBeenCalled();
  });

  it("publishes only current conflict callbacks and never replays the POST", async () => {
    const reason = new DashboardApiError({
      code: "CONFLICT",
      kind: "conflict",
      message: "current conflict",
      status: 409,
    });
    const operation = vi.fn(() => Promise.reject(reason));
    const effects = callbacks(() => true);

    await executeSensitiveMutation(operation, effects);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(effects.onError).toHaveBeenCalledWith(reason);
    expect(effects.onConflict).toHaveBeenCalledTimes(1);
    expect(effects.onSuccess).not.toHaveBeenCalled();
  });
});
