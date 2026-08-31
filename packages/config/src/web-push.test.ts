import { createECDH } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadWebPushServerConfig, webPushPublicConfig } from "./web-push";

const validVapid = createECDH("prime256v1");
validVapid.generateKeys();
const valid = {
  WEB_PUSH_ENABLED: "true",
  WEB_PUSH_ENDPOINT_FINGERPRINT_KEY_B64URL: Buffer.alloc(32, 5).toString(
    "base64url",
  ),
  WEB_PUSH_STORAGE_KEY_ACTIVE_B64URL: Buffer.alloc(32, 1).toString("base64url"),
  WEB_PUSH_STORAGE_KEY_ACTIVE_VERSION: "active-1",
  WEB_PUSH_VAPID_PRIVATE_KEY: validVapid.getPrivateKey().toString("base64url"),
  WEB_PUSH_VAPID_PUBLIC_KEY: validVapid.getPublicKey().toString("base64url"),
  WEB_PUSH_VAPID_SUBJECT: "mailto:ops@example.com",
};

describe("Web Push configuration", () => {
  it("rejects a structurally valid but mismatched VAPID key pair", () => {
    const first = createECDH("prime256v1");
    const second = createECDH("prime256v1");
    first.generateKeys();
    second.generateKeys();
    expect(() =>
      loadWebPushServerConfig({
        ...valid,
        WEB_PUSH_VAPID_PRIVATE_KEY: second
          .getPrivateKey()
          .toString("base64url"),
        WEB_PUSH_VAPID_PUBLIC_KEY: first.getPublicKey().toString("base64url"),
      }),
    ).toThrow("WEB_PUSH_VAPID key pair is invalid.");
  });
  it("is disabled by default without secrets", () => {
    expect(loadWebPushServerConfig({})).toEqual({ enabled: false });
    expect(loadWebPushServerConfig({ WEB_PUSH_ENABLED: "false" })).toEqual({
      enabled: false,
    });
    expect(() =>
      loadWebPushServerConfig({ WEB_PUSH_ENABLED: "yes" }),
    ).toThrow();
  });

  it("accepts enabled configuration and exposes only public values", () => {
    const config = loadWebPushServerConfig(valid);
    expect(config.enabled).toBe(true);
    expect(webPushPublicConfig(config)).toEqual({
      enabled: true,
      vapidPublicKey: valid.WEB_PUSH_VAPID_PUBLIC_KEY,
    });
    expect(JSON.stringify(webPushPublicConfig(config))).not.toContain(
      valid.WEB_PUSH_VAPID_PRIVATE_KEY,
    );
    expect(JSON.stringify(webPushPublicConfig(config))).not.toContain(
      valid.WEB_PUSH_ENDPOINT_FINGERPRINT_KEY_B64URL,
    );
  });

  it.each([
    "WEB_PUSH_VAPID_PRIVATE_KEY",
    "WEB_PUSH_VAPID_PUBLIC_KEY",
    "WEB_PUSH_VAPID_SUBJECT",
    "WEB_PUSH_STORAGE_KEY_ACTIVE_B64URL",
    "WEB_PUSH_STORAGE_KEY_ACTIVE_VERSION",
    "WEB_PUSH_ENDPOINT_FINGERPRINT_KEY_B64URL",
  ])("fails closed when %s is missing", (name) => {
    const environment = { ...valid } as Record<string, string>;
    delete environment[name];
    expect(() => loadWebPushServerConfig(environment)).toThrow();
  });

  it("validates subjects and a bounded previous-key pair", () => {
    expect(() =>
      loadWebPushServerConfig({ ...valid, WEB_PUSH_VAPID_SUBJECT: "http://x" }),
    ).toThrow();
    expect(
      loadWebPushServerConfig({
        ...valid,
        WEB_PUSH_STORAGE_KEY_PREVIOUS_B64URL: Buffer.alloc(32, 4).toString(
          "base64url",
        ),
        WEB_PUSH_STORAGE_KEY_PREVIOUS_VERSION: "previous-1",
      }).storageKeys?.previous?.version,
    ).toBe("previous-1");
    expect(() =>
      loadWebPushServerConfig({
        ...valid,
        WEB_PUSH_STORAGE_KEY_PREVIOUS_VERSION: "previous-1",
      }),
    ).toThrow();
  });

  it("rejects reused key bytes across cryptographic roles", () => {
    expect(() =>
      loadWebPushServerConfig({
        ...valid,
        WEB_PUSH_ENDPOINT_FINGERPRINT_KEY_B64URL:
          valid.WEB_PUSH_STORAGE_KEY_ACTIVE_B64URL,
      }),
    ).toThrow(/must differ/);
    expect(() =>
      loadWebPushServerConfig({
        ...valid,
        WEB_PUSH_STORAGE_KEY_PREVIOUS_B64URL:
          valid.WEB_PUSH_STORAGE_KEY_ACTIVE_B64URL,
        WEB_PUSH_STORAGE_KEY_PREVIOUS_VERSION: "previous-1",
      }),
    ).toThrow(/must differ/);
    expect(() =>
      loadWebPushServerConfig({
        ...valid,
        WEB_PUSH_ENDPOINT_FINGERPRINT_KEY_B64URL: Buffer.alloc(32, 4).toString(
          "base64url",
        ),
        WEB_PUSH_STORAGE_KEY_PREVIOUS_B64URL: Buffer.alloc(32, 4).toString(
          "base64url",
        ),
        WEB_PUSH_STORAGE_KEY_PREVIOUS_VERSION: "previous-1",
      }),
    ).toThrow(/must differ/);
  });
});
