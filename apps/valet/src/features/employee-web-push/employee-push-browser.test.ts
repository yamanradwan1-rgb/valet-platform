import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserEmployeePushRuntime } from "./employee-push-browser";

afterEach(() => vi.unstubAllGlobals());

describe("Employee production Service Worker registration", () => {
  it("registers the static worker at root scope without cache reuse", async () => {
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

    await new BrowserEmployeePushRuntime().getSubscription();
    expect(register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(getSubscription).toHaveBeenCalledOnce();
  });
});
