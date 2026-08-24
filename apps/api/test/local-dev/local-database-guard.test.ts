import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertLocalDevelopmentDatabaseTarget,
  assertLocalDevelopmentNodeEnvironment,
  isLocalLoopbackHost,
  REQUIRED_LOCAL_DATABASE_NAME,
} from "../../tools/local-dev/local-database-guard";
import {
  findRepositoryRoot,
  resolveBootstrapEnvironment,
  resolveStatusEnvironment,
} from "../../tools/local-dev/local-dev-environment";

describe("local database safety guards", () => {
  it("rejects every NODE_ENV except explicit development", () => {
    for (const environment of [
      undefined,
      "",
      "production",
      "test",
      "Development",
      "development ",
    ]) {
      expect(() => assertLocalDevelopmentNodeEnvironment(environment)).toThrow(
        "requires NODE_ENV to be exactly",
      );
    }
    expect(assertLocalDevelopmentNodeEnvironment("development")).toBe(
      "development",
    );
  });

  it("rejects remote PostgreSQL hosts", () => {
    for (const host of [
      "db.example.com",
      "10.0.0.5",
      "172.16.0.9",
      "192.168.1.10",
      "[2001:db8::1]",
      "",
    ]) {
      expect(() =>
        assertLocalDevelopmentDatabaseTarget(
          host,
          REQUIRED_LOCAL_DATABASE_NAME,
        ),
      ).toThrow("refuses PostgreSQL host");
    }
  });

  it("rejects databases other than exactly valet", () => {
    for (const database of ["valet_production", "VALET", "valet_staging", ""]) {
      expect(() =>
        assertLocalDevelopmentDatabaseTarget("localhost", database),
      ).toThrow("refuses database");
    }
  });

  it("allows loopback hosts with the valet database", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "::1",
      "[::1]",
      "LOCALHOST",
    ]) {
      const target = assertLocalDevelopmentDatabaseTarget(host, "valet");
      expect(target.database).toBe("valet");
      expect(isLocalLoopbackHost(host)).toBe(true);
    }
  });
});

describe("local development environment resolution", () => {
  const validRuntimeUrl =
    "postgresql://valet_runtime:runtime-password@127.0.0.1:5432/valet";
  const validMigrationUrl =
    "postgresql://valet_admin:admin-password@localhost:5432/valet";

  function environmentWith(
    overrides: Record<string, string>,
  ): NodeJS.ProcessEnv {
    return {
      NODE_ENV: "development",
      DATABASE_URL: validRuntimeUrl,
      MIGRATION_DATABASE_URL: validMigrationUrl,
      ...overrides,
    };
  }

  it("resolves guarded bootstrap and status environments", () => {
    const resolved = resolveBootstrapEnvironment(environmentWith({}));
    expect(resolved.migration?.parsed.hostname).toBe("localhost");
    expect(resolved.runtime.parsed.hostname).toBe("127.0.0.1");

    const status = resolveStatusEnvironment(environmentWith({}));
    expect(status.migration).toBeUndefined();
    expect(status.runtime.parsed.pathname).toBe("/valet");
  });

  it("rejects malformed, non-PostgreSQL and parameterized URLs before any action", () => {
    expect(() =>
      resolveBootstrapEnvironment(
        environmentWith({ MIGRATION_DATABASE_URL: "not a url" }),
      ),
    ).toThrow();
    expect(() =>
      resolveBootstrapEnvironment(
        environmentWith({
          DATABASE_URL: "mysql://user:password@127.0.0.1/valet",
        }),
      ),
    ).toThrow();
    expect(() =>
      resolveBootstrapEnvironment(
        environmentWith({
          DATABASE_URL:
            "postgresql://valet_runtime:password@127.0.0.1/valet?sslmode=disable",
        }),
      ),
    ).toThrow();
  });

  it("rejects production and remote targets through the same guard", () => {
    expect(() =>
      resolveBootstrapEnvironment(
        environmentWith({
          DATABASE_URL:
            "postgresql://valet_runtime:password@db.example.com:5432/valet",
        }),
      ),
    ).toThrow("refuses PostgreSQL host");
    expect(() =>
      resolveBootstrapEnvironment(
        environmentWith({
          DATABASE_URL:
            "postgresql://valet_runtime:password@127.0.0.1:5432/valet_production",
        }),
      ),
    ).toThrow("refuses database");
    expect(() =>
      resolveBootstrapEnvironment(environmentWith({ NODE_ENV: "production" })),
    ).toThrow("requires NODE_ENV");
    expect(() =>
      resolveStatusEnvironment(environmentWith({ NODE_ENV: "production" })),
    ).toThrow("requires NODE_ENV");
  });
});

describe("repository root discovery", () => {
  it("finds the nearest ancestor containing the workspace marker", () => {
    const root = mkdtempSync(join(tmpdir(), "vaylet-root-"));
    const nested = join(root, "apps", "api", "tools");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "");
    expect(findRepositoryRoot(nested)).toBe(root);
  });

  it("fails when no workspace marker exists above the start directory", () => {
    const orphan = mkdtempSync(join(tmpdir(), "vaylet-orphan-"));
    expect(() => findRepositoryRoot(orphan)).toThrow(
      "could not locate the pnpm workspace root",
    );
  });
});
