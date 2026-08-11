import { createHmac, randomBytes } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import {
  ClientAddressUnavailableError,
  parseCanonicalIp,
  TrustedClientAddressResolver,
} from "../src/modules/anti-abuse/client-address";
import type { ApiRequest } from "../src/common/http/api-request";

const originalSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
const originalCidrs = process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;

afterEach(() => {
  if (originalSecret === undefined)
    delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = originalSecret;
  if (originalCidrs === undefined)
    delete process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
  else process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = originalCidrs;
});

function request(options: {
  peer: string;
  rawXff?: readonly string[];
  xff?: string;
}): ApiRequest {
  const rawHeaders = (options.rawXff ?? []).flatMap((value) => [
    "X-Forwarded-For",
    value,
  ]);
  return {
    headers:
      options.xff === undefined ? {} : { "x-forwarded-for": options.xff },
    rawHeaders,
    socket: { remoteAddress: options.peer },
  };
}

describe("DEC-024 anti-abuse boundaries", () => {
  it("derives the exact domain-separated versioned HMAC key and advisory halves", () => {
    const secret = randomBytes(32);
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = secret.toString("base64url");
    const scope = "v1:staff-login-identifier" as const;
    const value = "staff@example.com";
    const expected = createHmac("sha256", secret)
      .update(scope, "utf8")
      .update(Buffer.from([0]))
      .update(value, "utf8")
      .digest();
    const key = new AntiAbuseKeyDeriver().derive(scope, value);
    expect(key).toEqual({
      keyHash: `anti-abuse-hmac-sha256:v1:${expected.toString("hex")}`,
      lockHigh: expected.readInt32BE(0),
      lockLow: expected.readInt32BE(4),
      scope,
    });
    expect(
      new AntiAbuseKeyDeriver().derive("v1:guest-token", value).keyHash,
    ).not.toBe(key.keyHash);
  });

  it("rejects every malformed HMAC secret shape", () => {
    for (const value of [
      undefined,
      "a".repeat(42),
      "a".repeat(44),
      "+".repeat(43),
      Buffer.alloc(31).toString("base64url"),
    ]) {
      if (value === undefined) delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
      else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = value;
      expect(() =>
        new AntiAbuseKeyDeriver().derive("v1:guest-token", "value"),
      ).toThrow();
    }
  });

  it("ignores forwarding headers in direct mode and for untrusted peers", () => {
    process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
    expect(
      new TrustedClientAddressResolver().resolve(
        request({
          peer: "192.0.2.1",
          rawXff: ["198.51.100.2"],
          xff: "198.51.100.2",
        }),
      ),
    ).toBe("192.0.2.1");
    process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "10.0.0.0/8";
    expect(
      new TrustedClientAddressResolver().resolve(
        request({
          peer: "192.0.2.1",
          rawXff: ["198.51.100.2"],
          xff: "198.51.100.2",
        }),
      ),
    ).toBe("192.0.2.1");
  });

  it("walks a trusted chain right-to-left and rejects malformed or duplicate XFF", () => {
    process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS =
      "10.0.0.0/8,2001:db8:ffff::/48";
    const resolver = new TrustedClientAddressResolver();
    expect(
      resolver.resolve(
        request({
          peer: "10.0.0.2",
          rawXff: ["198.51.100.9, 10.0.0.1"],
          xff: "198.51.100.9, 10.0.0.1",
        }),
      ),
    ).toBe("198.51.100.9");
    expect(() =>
      resolver.resolve(
        request({
          peer: "10.0.0.2",
          rawXff: ["198.51.100.9", "203.0.113.1"],
          xff: "198.51.100.9, 203.0.113.1",
        }),
      ),
    ).toThrow(ClientAddressUnavailableError);
    expect(() =>
      resolver.resolve(
        request({ peer: "10.0.0.2", rawXff: ["host:1234"], xff: "host:1234" }),
      ),
    ).toThrow(ClientAddressUnavailableError);
  });

  it("canonicalizes IPv4-mapped and alternate IPv6 forms into one bucket", () => {
    expect(parseCanonicalIp("::ffff:192.0.2.10").canonical).toBe("192.0.2.10");
    expect(parseCanonicalIp("2001:0DB8:0:0:0:0:0:1").canonical).toBe(
      "2001:db8::1",
    );
    expect(parseCanonicalIp("2001:db8::1").canonical).toBe("2001:db8::1");
    expect(() => parseCanonicalIp("192.168.001.001")).toThrow();
  });

  it("fails startup construction on malformed trusted proxy CIDRs", () => {
    for (const value of ["not-a-cidr", "10.0.0.0/33", "2001:db8::/129"]) {
      process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = value;
      expect(() => new TrustedClientAddressResolver()).toThrow(
        "ANTI_ABUSE_TRUSTED_PROXY_CIDRS contains an invalid CIDR.",
      );
    }
  });
});
