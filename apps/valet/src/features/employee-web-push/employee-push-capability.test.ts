import { describe, expect, it } from "vitest";

import { resolveEmployeePushCapability } from "./employee-push-capability";

const supported = {
  isIosLike: false,
  isStandalone: false,
  notification: true,
  permission: "default" as NotificationPermission,
  pushManager: true,
  serviceWorker: true,
};

describe("Employee Web Push capability state", () => {
  it("reports unsupported when a standards capability is missing", () => {
    expect(
      resolveEmployeePushCapability(
        { ...supported, pushManager: false },
        false,
      ),
    ).toBe("UNSUPPORTED");
  });

  it("guides iOS-like browser mode to Home Screen without prompting", () => {
    expect(
      resolveEmployeePushCapability(
        { ...supported, isIosLike: true, isStandalone: false },
        false,
      ),
    ).toBe("IOS_REQUIRES_HOME_SCREEN");
  });

  it("allows the normal explicit action in standalone iOS mode", () => {
    expect(
      resolveEmployeePushCapability(
        { ...supported, isIosLike: true, isStandalone: true },
        false,
      ),
    ).toBe("PROMPT_AVAILABLE");
  });

  it("does not require installation on another capable browser", () => {
    expect(resolveEmployeePushCapability(supported, false)).toBe(
      "PROMPT_AVAILABLE",
    );
  });

  it.each([
    ["denied", false, "DENIED"],
    ["granted", false, "GRANTED_UNSUBSCRIBED"],
    ["granted", true, "SUBSCRIBED"],
  ] as const)(
    "maps %s permission and subscription=%s to %s",
    (permission, hasSubscription, expected) => {
      expect(
        resolveEmployeePushCapability(
          { ...supported, permission },
          hasSubscription,
        ),
      ).toBe(expected);
    },
  );
});
