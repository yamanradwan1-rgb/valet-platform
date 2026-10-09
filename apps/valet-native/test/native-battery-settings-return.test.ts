import { describe, expect, it, vi } from "vitest";
import { NativeBatteryStatusOwner } from "../src/notifications/native-battery-status";

describe("#274 explicit battery settings return", () => {
  it("opens settings only after verified restriction and an explicit action", async () => {
    const openSettings = vi.fn(async () => undefined);
    const readStatus = vi.fn().mockResolvedValueOnce("restricted")
      .mockResolvedValueOnce("configured");
    const owner = new NativeBatteryStatusOwner({ readStatus, openSettings });
    owner.start(true);
    await vi.waitFor(() => expect(owner.current()).toBe("restricted"));
    expect(openSettings).not.toHaveBeenCalled();
    await owner.openSettings();
    expect(openSettings).toHaveBeenCalledOnce();
    owner.setForeground(false);
    expect(owner.current()).toBe("checking");
    owner.setForeground(true);
    await vi.waitFor(() => expect(owner.current()).toBe("configured"));
    await owner.openSettings();
    expect(openSettings).toHaveBeenCalledOnce();
    owner.dispose();
  });

  it("does not claim success after failed or unchanged settings navigation", async () => {
    const openSettings = vi.fn().mockRejectedValue(new Error("no system activity"));
    const readStatus = vi.fn().mockResolvedValue("restricted");
    const owner = new NativeBatteryStatusOwner({ readStatus, openSettings });
    owner.start(true);
    await vi.waitFor(() => expect(owner.current()).toBe("restricted"));
    await expect(owner.openSettings()).resolves.toBeUndefined();
    expect(owner.current()).toBe("restricted");
    owner.setForeground(false);
    owner.setForeground(true);
    await vi.waitFor(() => expect(readStatus).toHaveBeenCalledTimes(2));
    expect(owner.current()).toBe("restricted");
    owner.dispose();
  });
});
