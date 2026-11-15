import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import type { ApiRequest } from "../src/common/http/api-request";
import { AntiAbuseUnavailableError } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { Issue416A01RequestFingerprint } from "../src/modules/auth/vap1/issue416-a01-request-fingerprint";

const previousKey = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
const previousProxies = process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
const operation = "00000000-0000-4000-8000-000000000001";
const reservation = "00000000-0000-4000-8000-000000000002";
const keyHash = "anti-abuse-hmac-sha256:v1:" + "a".repeat(64);
const req = (address: string, forwarded?: string): ApiRequest => ({
  socket: { remoteAddress: address },
  rawHeaders: forwarded ? ["x-forwarded-for", forwarded] : [],
  headers: {},
} as ApiRequest);

function fixture() {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
    Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString("base64url");
  delete process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
  return new Issue416A01RequestFingerprint(new TrustedClientAddressResolver());
}

afterEach(() => {
  if (previousKey === undefined) delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = previousKey;
  if (previousProxies === undefined) delete process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
  else process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = previousProxies;
});

describe("Issue416 A01 authoritative server request fingerprint", () => {
  it("binds 32 bytes to original operation, limiter and trusted socket", () => {
    const f = fixture();
    const original = f.derive(req("192.0.2.41"), "user@example.invalid",
      operation, reservation, keyHash);
    expect(original).toHaveLength(32);
    expect(f.derive(req("192.0.2.41"), "user@example.invalid",
      operation, reservation, keyHash)).toEqual(original);
    expect(f.derive(req("192.0.2.42"), "user@example.invalid",
      operation, reservation, keyHash)).not.toEqual(original);
    expect(f.derive(req("192.0.2.41"), "other@example.invalid",
      operation, reservation, keyHash)).not.toEqual(original);
    expect(f.derive(req("192.0.2.41"), "user@example.invalid",
      reservation, operation, keyHash)).not.toEqual(original);
    expect(original).not.toEqual(createHash("sha256").update(keyHash).digest());
  });

  it("ignores forged Forwarded-For without an authorized proxy peer", () => {
    const f = fixture();
    expect(f.derive(req("192.0.2.41", "203.0.113.27"),
      "user@example.invalid", operation, reservation, keyHash)).toEqual(
      f.derive(req("192.0.2.41", "203.0.113.91"),
        "user@example.invalid", operation, reservation, keyHash),
    );
  });

  it("rejects missing peer, invalid root and malformed reservation", () => {
    const f = fixture();
    expect(() => f.derive({} as ApiRequest, "user@example.invalid",
      operation, reservation, keyHash)).toThrow(AntiAbuseUnavailableError);
    expect(() => f.derive(req("192.0.2.41"), "user@example.invalid",
      operation, "spoofed", keyHash)).toThrow(AntiAbuseUnavailableError);
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = "public-known-secret";
    expect(() => f.derive(req("192.0.2.41"), "user@example.invalid",
      operation, reservation, keyHash)).toThrow(AntiAbuseUnavailableError);
  });
});
