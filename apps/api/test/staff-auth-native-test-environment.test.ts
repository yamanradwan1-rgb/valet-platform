import { describe, expect, it, vi } from "vitest";

import {
  createFixtureStaffAuthWriterIdentity,
  fixtureProtectedMfaSelection,
  provisionStaffAuthWriter,
  resolveAttestedFixtureWriterEnvironment,
  resolveProtectedWriterEnvironment,
} from "./staff-auth-native-test-environment";

const applicationUrl =
  "postgresql://vaylet_runtime_test:runtime-secret@127.0.0.1:5432/fixture_db";
const writerUrl =
  "postgresql://vaylet_staff_auth_writer_test_123:writer-secret@127.0.0.1:5432/fixture_db";

describe("Staff Auth native fixture writer setup", () => {
  it("enables protected S02 in PostgreSQL CI even without a per-test switch", () => {
    expect(
      fixtureProtectedMfaSelection({
        GITHUB_ACTIONS: "true",
        GITHUB_JOB: "postgres",
      }),
    ).toBe("1");
    expect(
      fixtureProtectedMfaSelection({
        GITHUB_ACTIONS: "true",
        GITHUB_JOB: "postgres",
        ISSUE416_S02_PROTECTED_TEST: "0",
      }),
    ).toBe("1");
    expect(
      fixtureProtectedMfaSelection({
        GITHUB_ACTIONS: "true",
        GITHUB_JOB: "other",
      }),
    ).toBeUndefined();
  });

  it("maps PostgreSQL CI protection to a separate MFA role and key", () => {
    const mfaWriterUrl =
      "postgresql://vaylet_mfa_writer_test:another-secret@127.0.0.1:5432/fixture_db";
    const selected = resolveProtectedWriterEnvironment(
      { STAFF_AUTH_WRITER_DATABASE_URL: writerUrl },
      mfaWriterUrl,
      fixtureProtectedMfaSelection({
        GITHUB_ACTIONS: "true",
        GITHUB_JOB: "postgres",
      }),
      "independent-test-activity-key",
    );
    expect(selected.protectedMode).toBe(true);
    expect(selected.writers).toMatchObject({
      MFA_PROTECTED_WRITER_ENABLED: "true",
      MFA_WRITER_DATABASE_URL: mfaWriterUrl,
      MFA_ACTIVITY_PROOF_SECRET_B64URL: "independent-test-activity-key",
    });
    expect(selected.writers.MFA_WRITER_DATABASE_URL).not.toBe(writerUrl);
  });
  it("creates a unique writer role and secret for each fixture instance", () => {
    const first = createFixtureStaffAuthWriterIdentity(applicationUrl);
    const second = createFixtureStaffAuthWriterIdentity(applicationUrl);
    const firstUrl = new URL(first.url);
    const secondUrl = new URL(second.url);
    expect(first.role).toMatch(/^vaylet_staff_auth_writer_/);
    expect(second.role).not.toBe(first.role);
    expect(secondUrl.password).not.toBe(firstUrl.password);
    expect(firstUrl.hostname).toBe(new URL(applicationUrl).hostname);
    expect(firstUrl.port).toBe(new URL(applicationUrl).port);
    expect(firstUrl.pathname).toBe(new URL(applicationUrl).pathname);
  });

  it("requires an explicit same-database writer URL and derives its role", () => {
    expect(() =>
      resolveProtectedWriterEnvironment({}, applicationUrl, undefined, "x"),
    ).toThrow(/requires a dedicated writer URL/);
    const resolved = resolveProtectedWriterEnvironment(
      {
        STAFF_AUTH_WRITER_DATABASE_URL: writerUrl,
      },
      applicationUrl,
      undefined,
      "x",
    );
    expect(resolved.writers.STAFF_AUTH_WRITER_ROLE).toBe(
      "vaylet_staff_auth_writer_test_123",
    );
    expect(resolved.writers.STAFF_AUTH_WRITER_DATABASE_URL).toBe(writerUrl);
  });

  it("preserves protected-writer resolution and attests endpoints before fixture setup", () => {
    const name = "valet_mob007_auth_123_abc123ef";
    const runtime = applicationUrl.replace("/fixture_db", `/${name}`);
    const staffWriter = writerUrl.replace("/fixture_db", `/${name}`);
    const input = {
      activityRoot: "test-activity-proof",
      adminDatabaseUrl: "postgresql://admin:secret@127.0.0.1:5432/valet",
      applicationUrl: runtime,
      databaseName: name,
      explicitWriters: { STAFF_AUTH_WRITER_DATABASE_URL: staffWriter },
      mfaWriterPassword: "mfa-secret",
      mfaWriterRole: "vaylet_mfa_writer_test",
      migrationDatabaseUrl: `postgresql://migrator:secret@127.0.0.1:5432/${name}`,
    };
    const actual = resolveAttestedFixtureWriterEnvironment(input);
    expect(actual.writers.STAFF_AUTH_WRITER_DATABASE_URL).toBe(staffWriter);
    expect(actual.writers.STAFF_AUTH_WRITER_ROLE).toBe(
      "vaylet_staff_auth_writer_test_123",
    );
    if (actual.protectedMode) {
      expect(new URL(actual.writers.MFA_WRITER_DATABASE_URL!).username).toBe(
        "vaylet_mfa_writer_test",
      );
    }
    expect(() =>
      resolveAttestedFixtureWriterEnvironment({
        ...input,
        migrationDatabaseUrl: input.migrationDatabaseUrl.replace(
          ":5432/",
          ":65432/",
        ),
      }),
    ).toThrow(/database endpoints do not match/);
  });

  it("provisions the dedicated URL and role without a DATABASE_URL fallback", async () => {
    const runPnpm = vi.fn(
      async (args: string[], environment: NodeJS.ProcessEnv) => {
        void args;
        void environment;
      },
    );
    const writers = {
      STAFF_AUTH_WRITER_DATABASE_URL: writerUrl,
      STAFF_AUTH_WRITER_ROLE: "vaylet_staff_auth_writer_test_123",
    };
    await provisionStaffAuthWriter(
      runPnpm,
      applicationUrl,
      applicationUrl,
      writers,
    );
    expect(runPnpm).toHaveBeenCalledOnce();
    expect(runPnpm.mock.calls[0]?.[0]).toEqual([
      "--filter",
      "@valet/database",
      "staff-auth-writer:provision",
    ]);
    expect(runPnpm.mock.calls[0]?.[1]).toMatchObject({
      STAFF_AUTH_WRITER_DATABASE_URL: writerUrl,
      STAFF_AUTH_WRITER_ROLE: "vaylet_staff_auth_writer_test_123",
      NODE_ENV: "test",
    });
    expect(runPnpm.mock.calls[0]?.[1]).toHaveProperty(
      "DATABASE_URL",
      applicationUrl,
    );
  });
});
