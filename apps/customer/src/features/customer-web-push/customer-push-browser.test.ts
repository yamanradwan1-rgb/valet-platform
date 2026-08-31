import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserCustomerPushRuntime } from "./customer-push-browser";

afterEach(() => vi.unstubAllGlobals());

describe("Customer production Service Worker registration", () => {
  it("reuses the one root worker with cache-free update checks", async () => {
    const getSubscription = vi.fn().mockResolvedValue(null);
    const registration = { pushManager: { getSubscription } };
    const register = vi.fn().mockResolvedValue(registration);
    vi.stubGlobal("navigator", {
      maxTouchPoints: 0,
      platform: "Linux",
      serviceWorker: { ready: Promise.resolve(registration), register },
      userAgent: "Android",
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });

    const runtime = new BrowserCustomerPushRuntime();
    await runtime.getSubscription();
    await runtime.getSubscription();
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(getSubscription).toHaveBeenCalledTimes(2);
  });
});
