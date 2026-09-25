import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { MfaAssurancePolicy } from "../src/modules/auth/mfa/mfa-assurance-policy";
import { readLocalMfaBypassPolicy } from "../src/modules/auth/mfa/local-mfa-bypass";
import type {
  StaffSessionContext,
  StaffSessionContextResolver,
} from "../src/modules/auth/staff-session-context";

const localDatabase =
  "postgresql://runtime:local-password@localhost:5432/valet";
const sessionContext: StaffSessionContext = {
  accessTokenHash: "staff-access-sha256:v1:test",
  createdAt: new Date("2026-09-25T00:00:00.000Z"),
  staffAuthSessionId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
};

function environment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: localDatabase,
    NODE_ENV: "development",
    ...overrides,
  };
}

describe("local development MFA bypass policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled when absent, empty, or exactly false", () => {
    expect(readLocalMfaBypassPolicy(environment()).enabled).toBe(false);
    expect(
      readLocalMfaBypassPolicy(
        environment({ VAYLET_LOCAL_DISABLE_MFA: "" }),
      ).enabled,
    ).toBe(false);
    expect(
      readLocalMfaBypassPolicy(
        environment({ VAYLET_LOCAL_DISABLE_MFA: "false" }),
      ).enabled,
    ).toBe(false);
  });

  it.each(["localhost", "LOCALHOST", "127.0.0.1", "[::1]"])(
    "enables only a development PostgreSQL URL on %s",
    (host) => {
      const databaseUrl =
        `postgresql://runtime:local-password@${host}:5432/valet`;
      expect(
        readLocalMfaBypassPolicy(
          environment({
            DATABASE_URL: databaseUrl,
            VAYLET_LOCAL_DISABLE_MFA: "true",
          }),
        ).enabled,
      ).toBe(true);
    },
  );

  it.each(["production", "test"])(
    "fails closed when enabled in NODE_ENV=%s",
    (nodeEnv) => {
      expect(() =>
        readLocalMfaBypassPolicy(
          environment({
            NODE_ENV: nodeEnv,
            VAYLET_LOCAL_DISABLE_MFA: "true",
          }),
        ),
      ).toThrow("may only be enabled for local development");
    },
  );

  it("fails closed for remote, missing, and malformed database URLs", () => {
    for (const databaseUrl of [
      "postgresql://runtime:secret@db.example.com:5432/valet",
      "not-a-url",
      "",
    ]) {
      expect(() =>
        readLocalMfaBypassPolicy(
          environment({
            DATABASE_URL: databaseUrl,
            VAYLET_LOCAL_DISABLE_MFA: "true",
          }),
        ),
      ).toThrow("may only be enabled for local development");
    }
    expect(() =>
      readLocalMfaBypassPolicy({
        NODE_ENV: "development",
        VAYLET_LOCAL_DISABLE_MFA: "true",
      }),
    ).toThrow("may only be enabled for local development");
  });

  it.each(["TRUE", "1", "yes", "on"])(
    "rejects non-canonical flag value %s",
    (value) => {
      expect(() =>
        readLocalMfaBypassPolicy(
          environment({ VAYLET_LOCAL_DISABLE_MFA: value }),
        ),
      ).toThrow('must be exactly "true" or "false"');
    },
  );

  it("never includes database credentials in configuration errors", () => {
    const secret = "do-not-disclose";
    let message = "";
    try {
      readLocalMfaBypassPolicy(
        environment({
          DATABASE_URL:
            `postgresql://runtime:${secret}@remote.example.com:5432/valet`,
          VAYLET_LOCAL_DISABLE_MFA: "true",
        }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(secret);
  });

  it("keeps the non-transactional assurance session recheck before bypass", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", localDatabase);
    vi.stubEnv("VAYLET_LOCAL_DISABLE_MFA", "true");
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{
        factor_current: false,
        last_admin_activity_at: null,
        mfa_authenticated_at: null,
        mfa_factor_id: null,
        now: new Date("2026-09-25T00:01:00.000Z"),
      }],
    });
    const resolve = vi.fn().mockResolvedValue(sessionContext);
    const policy = new MfaAssurancePolicy(
      { query } as unknown as PostgresPool,
      { resolve } as StaffSessionContextResolver,
    );

    await expect(policy.require("Bearer valid")).resolves.toEqual(sessionContext);
    await expect(policy.assess("Bearer valid")).resolves.toBe("ASSURANCE_VALID");
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
