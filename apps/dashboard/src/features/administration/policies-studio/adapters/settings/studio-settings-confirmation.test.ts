import { describe, expect, it, vi } from "vitest";

import { confirmedStudioSettingsMutation } from "./studio-settings-confirmation";

describe("Policies Studio asynchronous save confirmation", () => {
  it("returns true and refreshes only after a successful awaited operation", async () => {
    const operation = vi.fn().mockResolvedValue({ updatedAt: "new-version" });
    const reload = vi.fn();
    const run = vi.fn(async (execute: () => Promise<unknown>, success: () => void) => {
      await execute();
      success();
    });
    await expect(confirmedStudioSettingsMutation(run, operation, reload)).resolves.toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each(["mfa", "conflict", "network"])(
    "does not close an editor or claim saved on %s without guarded success",
    async () => {
      const operation = vi.fn();
      const reload = vi.fn();
      const run = vi.fn().mockResolvedValue(undefined);
      await expect(confirmedStudioSettingsMutation(run, operation, reload)).resolves.toBe(false);
      expect(reload).not.toHaveBeenCalled();
    },
  );
});
