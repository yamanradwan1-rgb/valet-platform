import { describe, expect, it, vi } from "vitest";

import {
  createFixtureStaffAuthWriterIdentity,
  provisionStaffAuthWriter,
  resolveProtectedWriterEnvironment,
} from "./staff-auth-native-test-environment";

const applicationUrl =
  "postgresql://vaylet_runtime_test:runtime-secret@127.0.0.1:5432/fixture_db";
const writerUrl =
  "postgresql://vaylet_staff_auth_writer_test_123:writer-secret@127.0.0.1:5432/fixture_db";

describe("Staff Auth native fixture writer setup", () => {
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
