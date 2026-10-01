import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  STAFF_AUTH_DUMMY_PASSWORD_HASH,
  StaffAuthService,
  type StaffPasswordVerifier,
} from "../src/modules/auth/staff-auth.service";
import { parseStaffAuthAllowedOrigins } from "../src/modules/auth/staff-auth.origin";

function failureHarness(
  row:
    | {
        id: string;
        password_hash: string | null;
        status: "ACTIVE" | "DISABLED" | "PENDING";
      }
    | undefined,
) {
  const query = vi.fn().mockResolvedValue({
    rowCount: row === undefined ? 0 : 1,
    rows: row === undefined ? [] : [row],
  });
  const verify = vi.fn().mockResolvedValue(false);
  const service = new StaffAuthService(
    { query } as unknown as Pool,
    { verify } as StaffPasswordVerifier,
  );
  return { service, verify };
}

describe("staff login timing-equalization boundary", () => {
  it("verifies the dummy once and rejects a passwordless pending account", async () => {
    const { service, verify } = failureHarness({
      id: "f6d2749c-e646-44fc-aa41-d84b65014739",
      password_hash: null,
      status: "PENDING",
    });
    await expect(
      service.login("pending@example.com", "candidate"),
    ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_FAILED" });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(
      STAFF_AUTH_DUMMY_PASSWORD_HASH,
      "candidate",
    );
  });
  it("performs exactly one verification against the dummy hash for unknown email", async () => {
    const { service, verify } = failureHarness(undefined);
    await expect(
      service.login("unknown@example.com", "candidate"),
    ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_FAILED" });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(
      STAFF_AUTH_DUMMY_PASSWORD_HASH,
      "candidate",
    );
  });

  it("performs the same dummy verification for malformed stored hashes", async () => {
    const { service, verify } = failureHarness({
      id: "f6d2749c-e646-44fc-aa41-d84b65014739",
      password_hash: "legacy-placeholder",
      status: "ACTIVE",
    });
    await expect(
      service.login("legacy@example.com", "candidate"),
    ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_FAILED" });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(
      STAFF_AUTH_DUMMY_PASSWORD_HASH,
      "candidate",
    );
  });

  it("does not use a cheap pre-verification return for disabled users", async () => {
    const acceptedHash =
      "$argon2id$v=19$m=65536,p=4,t=3$dmF5bGV0LWR1bW15LXYwMQ$GwCTUHTzbfRTG4lBOkCBl3m1yb8/4PKLBerf0R1sgnQ";
    const { service, verify } = failureHarness({
      id: "f6d2749c-e646-44fc-aa41-d84b65014739",
      password_hash: acceptedHash,
      status: "DISABLED",
    });
    await expect(
      service.login("disabled@example.com", "candidate"),
    ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_FAILED" });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(acceptedHash, "candidate");
  });
});

describe("staff authentication origin configuration", () => {
  it("accepts only explicit canonical origins and rejects wildcard configuration", () => {
    expect(
      parseStaffAuthAllowedOrigins(
        "https://staff.example,https://dashboard.example",
      ),
    ).toEqual(new Set(["https://staff.example", "https://dashboard.example"]));
    expect(() => parseStaffAuthAllowedOrigins("*")).toThrow(
      "explicit allowed origins",
    );
    expect(() =>
      parseStaffAuthAllowedOrigins("https://staff.example/path"),
    ).toThrow("canonical HTTP origins");
  });
});
