import { describe, expect, it } from "vitest";

import { applyNativeReleaseConfigPreflight } from "../app.config";
import {
  NATIVE_RELEASE_CUSTOMER_APP_ORIGIN_ERROR,
  resolveNativeCustomerAppOrigin,
} from "../src/guest-access/native-customer-app-origin";

const config = { name: "VAYLET Employee", slug: "vaylet-employee" };

function release(origin: string | undefined) {
  return () =>
    applyNativeReleaseConfigPreflight(config, {
      EXPO_PUBLIC_CUSTOMER_APP_ORIGIN: origin,
      NODE_ENV: "production",
      argv: ["expo", "export:embed", "--dev", "false"],
    });
}

describe("Native release Customer origin preflight", () => {
  it("accepts a valid bare HTTPS Customer App origin", () => {
    expect(release("https://customer.example.com")).not.toThrow();
  });

  it.each([
    ["localhost HTTP", "http://localhost:3002"],
    ["normal HTTP", "http://customer.example.com"],
    ["missing", undefined],
    ["malformed", "customer.example.com"],
    ["path", "https://customer.example.com/app"],
    ["query", "https://customer.example.com?x=1"],
    ["fragment", "https://customer.example.com/#foo"],
  ])("rejects release configuration with %s", (_case, origin) => {
    expect(release(origin)).toThrow(NATIVE_RELEASE_CUSTOMER_APP_ORIGIN_ERROR);
  });

  it("keeps localhost HTTP available to Native development", () => {
    expect(
      resolveNativeCustomerAppOrigin({
        isProduction: false,
        raw: "http://localhost:3002",
      }),
    ).toEqual({ ok: true, origin: "http://localhost:3002" });
    expect(
      applyNativeReleaseConfigPreflight(config, {
        EXPO_PUBLIC_CUSTOMER_APP_ORIGIN: "http://localhost:3002",
        NODE_ENV: "development",
        argv: ["expo", "start", "--dev-client"],
      }),
    ).toBe(config);
  });
});
