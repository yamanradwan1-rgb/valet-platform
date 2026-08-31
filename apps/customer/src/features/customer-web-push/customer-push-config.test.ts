import { describe, expect, it } from "vitest";

import { parseCustomerPushPublicConfig } from "./customer-push-config";

const KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString(
  "base64url",
);

describe("Customer Web Push public configuration", () => {
  it("is disabled unless explicitly enabled with a valid public VAPID key", () => {
    expect(parseCustomerPushPublicConfig({})).toEqual({ enabled: false });
    expect(
      parseCustomerPushPublicConfig({
        enabled: "true",
        vapidPublicKey: "invalid",
      }),
    ).toEqual({ enabled: false });
    expect(
      parseCustomerPushPublicConfig({ enabled: "true", vapidPublicKey: KEY }),
    ).toEqual({ enabled: true, vapidPublicKey: KEY });
  });
});
