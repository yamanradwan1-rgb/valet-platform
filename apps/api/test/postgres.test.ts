import { rootCertificates } from "node:tls";

import { afterEach, describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres.js";

const pools: ReturnType<typeof createRuntimePostgresPool>[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map(async (pool) => await pool.end()));
});

describe("application runtime PostgreSQL connection URL", () => {
  it("rejects a missing DATABASE_URL", () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => createRuntimePostgresPool()).toThrow(
        "Application runtime requires DATABASE_URL.",
      );
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it("rejects query parameters before constructing a connection pool", () => {
    const password = "runtime-query-secret";
    const databaseUrl =
      `postgresql://valet_runtime:${password}@127.0.0.1:1/valet` +
      "?user=valet_migration";

    expect(() => createRuntimePostgresPool(databaseUrl)).toThrow(
      "Application runtime DATABASE_URL must not contain query parameters.",
    );

    try {
      createRuntimePostgresPool(databaseUrl);
    } catch (error) {
      const message = (error as Error).message;
      expect(message.includes(password)).toBe(false);
      expect(message.includes(databaseUrl)).toBe(false);
    }
  });

  it("rejects URL fragments before constructing a connection pool", () => {
    expect(() =>
      createRuntimePostgresPool(
        "postgresql://valet_runtime:secret@127.0.0.1:1/valet#override",
      ),
    ).toThrow(
      "Application runtime DATABASE_URL must not contain a URL fragment.",
    );
  });

  it.each([
    [
      "non-PostgreSQL protocols",
      "https://valet_runtime:secret@127.0.0.1/valet",
      "Application runtime requires a PostgreSQL DATABASE_URL.",
    ],
    [
      "a missing username",
      "postgresql://:secret@127.0.0.1/valet",
      "Application runtime DATABASE_URL requires a username.",
    ],
    [
      "a missing password",
      "postgresql://valet_runtime@127.0.0.1/valet",
      "Application runtime DATABASE_URL requires a password.",
    ],
    [
      "a missing database name",
      "postgresql://valet_runtime:secret@127.0.0.1/",
      "Application runtime DATABASE_URL requires a database name.",
    ],
  ])("rejects %s", (_caseName, databaseUrl, expectedMessage) => {
    expect(() => createRuntimePostgresPool(databaseUrl)).toThrow(
      expectedMessage,
    );
  });

  it("enables strict production TLS with system trust by default", () => {
    const pool = createRuntimePostgresPool(
      "postgresql://valet_runtime:secret@database.example/valet",
      { NODE_ENV: "production" },
    );
    pools.push(pool);
    expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("passes an explicit valid CA without weakening certificate verification", () => {
    const ca = rootCertificates[0];
    expect(ca).toBeDefined();
    const pool = createRuntimePostgresPool(
      "postgresql://valet_runtime:secret@database.example/valet",
      { DATABASE_TLS_CA_PEM: ca, NODE_ENV: "production" },
    );
    pools.push(pool);
    expect(pool.options.ssl).toEqual({ ca, rejectUnauthorized: true });
  });

  it.each(["", "   ", "private-ca-sentinel-not-a-certificate"])(
    "rejects invalid provided CA material without exposing it",
    (ca) => {
      try {
        createRuntimePostgresPool(
          "postgresql://valet_runtime:secret@database.example/valet",
          { DATABASE_TLS_CA_PEM: ca, NODE_ENV: "production" },
        );
        throw new Error("Expected invalid CA rejection.");
      } catch (error) {
        expect((error as Error).message).toBe(
          "Production database TLS CA material is invalid.",
        );
        if (ca.trim() !== "") {
          expect((error as Error).message).not.toContain(ca.trim());
        }
      }
    },
  );

  it("rejects migration credentials in the production API environment", () => {
    expect(() =>
      createRuntimePostgresPool(
        "postgresql://valet_runtime:runtime-secret@database.example/valet",
        {
          MIGRATION_DATABASE_URL:
            "postgresql://valet_admin:admin-secret@database.example/valet?sslmode=require&sslaccept=strict",
          NODE_ENV: "production",
        },
      ),
    ).toThrow(
      "Production application runtime must not receive MIGRATION_DATABASE_URL.",
    );
  });

  it("keeps development plaintext-capable when both database URLs are present", () => {
    const pool = createRuntimePostgresPool(
      "postgresql://valet_runtime:runtime-secret@127.0.0.1/valet",
      {
        MIGRATION_DATABASE_URL:
          "postgresql://valet_admin:admin-secret@127.0.0.1/valet",
        NODE_ENV: "development",
      },
    );
    pools.push(pool);
    expect(pool.options.ssl).toBeUndefined();
  });
});
