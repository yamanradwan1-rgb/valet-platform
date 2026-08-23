import { describe, expect, it } from "vitest";

import {
  buildGuestAccessUrl,
  isGuestTokenShape,
  resolveCustomerAppOrigin,
} from "./customer-app-origin";

const VALID_TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_";

describe("resolveCustomerAppOrigin", () => {
  it("fails closed when the origin is missing or blank", () => {
    expect(resolveCustomerAppOrigin({ isProduction: false, raw: undefined }))
      .toEqual({ ok: false, reason: "MISSING" });
    expect(resolveCustomerAppOrigin({ isProduction: false, raw: "" }))
      .toEqual({ ok: false, reason: "MISSING" });
    expect(resolveCustomerAppOrigin({ isProduction: false, raw: "   " }))
      .toEqual({ ok: false, reason: "MISSING" });
  });

  it("rejects values that are not absolute URLs", () => {
    expect(resolveCustomerAppOrigin({ isProduction: false, raw: "localhost:3002" }))
      .toEqual({ ok: false, reason: "INVALID" });
    expect(resolveCustomerAppOrigin({ isProduction: false, raw: "not a url" }))
      .toEqual({ ok: false, reason: "INVALID" });
  });

  it("rejects credentials, query strings, fragments, and non-root paths", () => {
    const cases = [
      "https://u:p@customer.example.com",
      "https://customer.example.com/?x=1",
      "https://customer.example.com/#frag",
      "https://customer.example.com/app",
    ];
    for (const raw of cases) {
      expect(
        resolveCustomerAppOrigin({ isProduction: false, raw }),
      ).toEqual({ ok: false, reason: "INVALID" });
    }
  });

  it("rejects plain HTTP in production even for localhost", () => {
    expect(
      resolveCustomerAppOrigin({
        isProduction: true,
        raw: "http://localhost:3002",
      }),
    ).toEqual({ ok: false, reason: "INVALID" });
    expect(
      resolveCustomerAppOrigin({
        isProduction: true,
        raw: "http://customer.example.com",
      }),
    ).toEqual({ ok: false, reason: "INVALID" });
  });

  it("accepts localhost HTTP only outside production", () => {
    expect(
      resolveCustomerAppOrigin({
        isProduction: false,
        raw: "http://localhost:3002",
      }),
    ).toEqual({ ok: true, origin: "http://localhost:3002" });
    expect(
      resolveCustomerAppOrigin({
        isProduction: false,
        raw: "http://127.0.0.1:3002",
      }),
    ).toEqual({ ok: true, origin: "http://127.0.0.1:3002" });
    expect(
      resolveCustomerAppOrigin({
        isProduction: false,
        raw: "http://customer.example.com",
      }),
    ).toEqual({ ok: false, reason: "INVALID" });
  });

  it("accepts HTTPS origins and strips any trailing slash deterministically", () => {
    expect(
      resolveCustomerAppOrigin({
        isProduction: true,
        raw: "https://customer.example.com/",
      }),
    ).toEqual({ ok: true, origin: "https://customer.example.com" });
  });
});

describe("buildGuestAccessUrl", () => {
  it("produces the exact canonical fragment URL", () => {
    expect(buildGuestAccessUrl("https://customer.example.com", VALID_TOKEN))
      .toBe(`https://customer.example.com/#guestToken=${VALID_TOKEN}`);
    expect(buildGuestAccessUrl("http://localhost:3002", VALID_TOKEN))
      .toBe(`http://localhost:3002/#guestToken=${VALID_TOKEN}`);
  });

  it("refuses to encode credential material with an invalid shape", () => {
    expect(
      buildGuestAccessUrl("https://customer.example.com", "short-token"),
    ).toBeNull();
    expect(buildGuestAccessUrl("https://customer.example.com", "")).toBeNull();
  });
});

describe("isGuestTokenShape", () => {
  it("accepts exactly 43 base64url characters and nothing else", () => {
    expect(isGuestTokenShape(VALID_TOKEN)).toBe(true);
    expect(isGuestTokenShape(`${VALID_TOKEN}a`)).toBe(false);
    expect(isGuestTokenShape(VALID_TOKEN.slice(1))).toBe(false);
    expect(isGuestTokenShape(`${VALID_TOKEN}/`)).toBe(false);
  });
});
