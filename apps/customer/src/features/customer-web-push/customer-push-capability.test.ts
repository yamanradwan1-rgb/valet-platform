import { describe, expect, it } from "vitest";

import { resolveCustomerPushCapability } from "./customer-push-capability";

const capable = {
  isIosLike: false,
  isStandalone: false,
  notification: true,
  permission: "default" as NotificationPermission,
  pushManager: true,
  serviceWorker: true,
};

describe("Customer Web Push capability", () => {
  it("normalizes unavailable, unsupported, permission, and subscription states", () => {
    expect(resolveCustomerPushCapability(capable, false, false)).toBe(
      "UNAVAILABLE",
    );
    expect(
      resolveCustomerPushCapability(
        { ...capable, pushManager: false },
        true,
        false,
      ),
    ).toBe("UNSUPPORTED");
    expect(resolveCustomerPushCapability(capable, true, false)).toBe(
      "PROMPT_AVAILABLE",
    );
    expect(
      resolveCustomerPushCapability(
        { ...capable, permission: "denied" },
        true,
        false,
      ),
    ).toBe("DENIED");
    expect(
      resolveCustomerPushCapability(
        { ...capable, permission: "granted" },
        true,
        false,
      ),
    ).toBe("GRANTED_UNSUBSCRIBED");
    expect(
      resolveCustomerPushCapability(
        { ...capable, permission: "granted" },
        true,
        true,
      ),
    ).toBe("SUBSCRIBED");
  });

  it("requires iOS-like browser mode to use a Home Screen app without treating install as authority", () => {
    expect(
      resolveCustomerPushCapability(
        { ...capable, isIosLike: true },
        true,
        false,
      ),
    ).toBe("IOS_REQUIRES_HOME_SCREEN");
    expect(
      resolveCustomerPushCapability(
        { ...capable, isIosLike: true, isStandalone: true },
        true,
        false,
      ),
    ).toBe("PROMPT_AVAILABLE");
  });
});
