import { describe, expect, it } from "vitest";

import { createRuntimePostgresPool } from "../src/common/database/postgres.js";

describe("application runtime PostgreSQL connection URL", () => {
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
});
