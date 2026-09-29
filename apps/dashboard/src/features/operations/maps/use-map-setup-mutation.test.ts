import { describe, expect, it, vi } from "vitest";

import {
  DashboardApiError,
  dashboardMutationRetryRequiredError,
  dashboardNetworkError,
} from "../../../lib/api/dashboard-api-error";
import { executeMapSetupMutation } from "./use-map-setup-mutation";

const reloadOk = () => Promise.resolve({ ok: true } as const);
const reloadFail = () => Promise.resolve({ ok: false, error: new Error("reload failed") } as const);
const successWrite = () => Promise.resolve({});
const conflict = () => Promise.reject(new DashboardApiError({
  kind: "conflict", code: "MAP_SETUP_CONFLICT", message: "conflict", status: 409,
}));
const unknown = () => Promise.reject(dashboardNetworkError());
const retry = () => Promise.reject(dashboardMutationRetryRequiredError());

async function run(write: () => Promise<unknown>, reload: typeof reloadOk | typeof reloadFail) {
  const writeSpy = vi.fn(write);
  const reloadSpy = vi.fn(reload);
  const result = await executeMapSetupMutation(writeSpy, reloadSpy);
  return { reloadSpy, result, writeSpy };
}

describe("map setup mutation outcome model", () => {
  it("closes only after write success and distinguishes refresh success", async () => {
    const success = await run(successWrite, reloadOk);
    expect(success.result).toEqual({ closeEditor: true, error: null, notice: null });
    expect(success.writeSpy).toHaveBeenCalledTimes(1);
    expect(success.reloadSpy).toHaveBeenCalledTimes(1);

    const refreshFailed = await run(successWrite, reloadFail);
    expect(refreshFailed.result).toEqual({
      closeEditor: true, error: null, notice: "saved_refresh_failed",
    });
    expect(refreshFailed.writeSpy).toHaveBeenCalledTimes(1);
    expect(refreshFailed.reloadSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    [conflict, reloadOk, "conflict_reloaded"],
    [conflict, reloadFail, "conflict_reload_failed"],
    [unknown, reloadOk, "unknown_reloaded"],
    [unknown, reloadFail, "unknown_reload_failed"],
    [retry, reloadOk, "retry_reloaded"],
    [retry, reloadFail, "retry_reload_failed"],
  ] as const)("classifies failed write without replay (%s)", async (write, reload, notice) => {
    const outcome = await run(write, reload);
    expect(outcome.result).toEqual({ closeEditor: true, error: null, notice });
    expect(outcome.writeSpy).toHaveBeenCalledTimes(1);
    expect(outcome.reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps a definite API rejection definite and does not reload or replay", async () => {
    const write = vi.fn(() => Promise.reject(new DashboardApiError({
      kind: "validation", code: "VALIDATION_FAILED", message: "invalid map input", status: 400,
    })));
    const reload = vi.fn(reloadOk);
    await expect(executeMapSetupMutation(write, reload)).resolves.toEqual({
      closeEditor: false, error: "invalid map input", notice: null,
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload or publish success after the owning scope is invalidated", async () => {
    let current = true;
    const write = vi.fn(async () => {
      current = false;
    });
    const reload = vi.fn(reloadOk);

    await expect(
      executeMapSetupMutation(write, reload, () => current),
    ).resolves.toEqual({ closeEditor: false, error: null, notice: null });
    expect(write).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([conflict, unknown, retry])(
    "does not reconcile a failed write after invalidation (%s)",
    async (failure) => {
      let current = true;
      const write = vi.fn(async () => {
        try {
          await failure();
        } finally {
          current = false;
        }
      });
      const reload = vi.fn(reloadOk);

      await expect(
        executeMapSetupMutation(write, reload, () => current),
      ).resolves.toEqual({ closeEditor: false, error: null, notice: null });
      expect(write).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();
    },
  );
});
