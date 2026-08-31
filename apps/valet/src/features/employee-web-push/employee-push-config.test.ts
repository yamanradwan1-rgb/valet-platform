import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseEmployeePushPublicConfig,
  readEmployeePushPublicConfig,
} from "./employee-push-config";

const PUBLIC_KEY = Buffer.concat([
  Buffer.from([4]),
  Buffer.alloc(64, 7),
]).toString("base64url");

afterEach(() => vi.unstubAllEnvs());

describe("Employee public Web Push configuration", () => {
  it("accepts only an enabled canonical public P-256 key", () => {
    expect(
      parseEmployeePushPublicConfig({
        enabled: "true",
        vapidPublicKey: PUBLIC_KEY,
      }),
    ).toEqual({ enabled: true, vapidPublicKey: PUBLIC_KEY });
    expect(
      parseEmployeePushPublicConfig({ enabled: "true", vapidPublicKey: "bad" }),
    ).toEqual({ enabled: false });
  });

  it("keeps browser registration disabled outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY", PUBLIC_KEY);
    expect(readEmployeePushPublicConfig()).toEqual({ enabled: false });
  });

  it("exposes only the validated public key in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY", PUBLIC_KEY);
    expect(readEmployeePushPublicConfig()).toEqual({
      enabled: true,
      vapidPublicKey: PUBLIC_KEY,
    });
  });
});
