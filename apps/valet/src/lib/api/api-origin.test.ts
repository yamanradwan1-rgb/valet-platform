import { describe, expect, it } from "vitest";

import {
  EMPLOYEE_STAFF_API_REWRITE_SOURCE,
  employeeStaffApiRewriteDestination,
  resolveEmployeeApiOrigin,
} from "./api-origin";

describe("Employee Web API_ORIGIN production transport", () => {
  it("fails closed on missing and unsafe remote HTTP upstreams", () => {
    for (const apiOrigin of [
      undefined, "", "http://remote-host.example:3001", "http://10.0.0.10:3001",
      "http://192.168.1.20:3001", "http://public-api.example.com",
      "http://localhost:3001", "http://127.1:3001", "http://127.0.0.2:3001",
    ]) {
      expect(() => resolveEmployeeApiOrigin({ apiOrigin, nodeEnv: "production" })).toThrow(/API_ORIGIN/);
    }
  });

  it("rejects credentials, unsupported schemes, paths, query and fragment", () => {
    for (const apiOrigin of [
      "garbage", "ftp://api.example.com", "https://user:pass@api.example.com",
      "https://api.example.com/a", "https://api.example.com/a/..",
      "https://api.example.com?x=y", "https://api.example.com#secret",
      "https://api.example.com\\a",
    ]) {
      expect(() => resolveEmployeeApiOrigin({ apiOrigin, nodeEnv: "production" })).toThrow(/API_ORIGIN/);
    }
  });

  it("accepts HTTPS, explicit loopback, and preserves Staff proxy paths", () => {
    expect(resolveEmployeeApiOrigin({ apiOrigin: "https://api.example.com:8443/", nodeEnv: "production" }))
      .toBe("https://api.example.com:8443");
    for (const apiOrigin of ["http://127.0.0.1:3001", "http://[::1]:3001"]) {
      expect(resolveEmployeeApiOrigin({ apiOrigin, nodeEnv: "production" })).toBe(apiOrigin);
    }
    expect(EMPLOYEE_STAFF_API_REWRITE_SOURCE).toBe("/v1/staff/:path*");
    expect(employeeStaffApiRewriteDestination({ apiOrigin: "https://api.example.com", nodeEnv: "production" }))
      .toBe("https://api.example.com/v1/staff/:path*");
    expect(resolveEmployeeApiOrigin({ apiOrigin: undefined, nodeEnv: "development" }))
      .toBe("http://localhost:3001");
  });
});
