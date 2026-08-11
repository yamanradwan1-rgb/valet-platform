import { describe, expect, it } from "vitest";

import {
  assertDatabaseCredentialSeparation,
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
} from "../scripts/database-connection-policy.mjs";

const productionMigrationBase =
  "postgresql://valet_admin:admin-secret@database.example:5432/valet";
const productionRuntimeBase =
  "postgresql://valet_runtime:runtime-secret@database.example:5432/valet";

describe("production migration database connection policy", () => {
  it("accepts only exact require and strict TLS values without stripping them", () => {
    const value = `${productionMigrationBase}?sslmode=require&sslaccept=strict`;
    const migration = parseMigrationDatabaseUrl(value, "production");
    expect(migration.value).toBe(value);
    expect(migrationClientConfig(migration, "production")).toMatchObject({
      database: "valet",
      host: "database.example",
      password: "admin-secret",
      port: 5432,
      ssl: { rejectUnauthorized: true },
      user: "valet_admin",
    });
  });

  it(
    "accepts a POSIX absolute sslrootcert path without changing Prisma's URL",
    () => {
      const value =
        `${productionMigrationBase}?sslmode=require&sslaccept=strict` +
        "&sslrootcert=%2Fdeployment%2Fdatabase-ca.pem";
      const migration = parseMigrationDatabaseUrl(value, "production");
      expect(migration.parsed.searchParams.get("sslrootcert")).toBe(
        "/deployment/database-ca.pem",
      );
      expect(migration.value).toBe(value);
    },
  );

  it("accepts Windows absolute sslrootcert path syntax platform-safely", () => {
    const value =
      `${productionMigrationBase}?sslmode=require&sslaccept=strict` +
      "&sslrootcert=C%3A%5Cdeployment%5Cdatabase-ca.pem";
    const migration = parseMigrationDatabaseUrl(value, "production");
    expect(migration.parsed.searchParams.get("sslrootcert")).toBe(
      "C:\\deployment\\database-ca.pem",
    );
    expect(migration.value).toBe(value);
  });

  it(
    "reads the exact decoded absolute path without leaking path or CA failures",
    () => {
      const value =
        `${productionMigrationBase}?sslmode=require&sslaccept=strict` +
        "&sslrootcert=%2Fdeployment%2Fprivate%20database-ca.pem";
      const migration = parseMigrationDatabaseUrl(value, "production");
      const reads: Array<{ encoding: string; path: string }> = [];
      const config = migrationClientConfig(
        migration,
        "production",
        (path, encoding) => {
          reads.push({ encoding, path });
          return "private-ca-contents";
        },
      );
      expect(reads).toEqual([
        { encoding: "utf8", path: "/deployment/private database-ca.pem" },
      ]);
      expect(config.ssl).toEqual({
        ca: "private-ca-contents",
        rejectUnauthorized: true,
      });
      expect(migration.value).toBe(value);

      for (const [readCertificate, expectedMessage] of [
        [
          () => {
            throw new Error("/deployment/private database-ca.pem");
          },
          "Production migration TLS CA material is unavailable.",
        ],
        [() => "", "Production migration TLS CA material is invalid."],
      ] as const) {
        let failure: Error | undefined;
        try {
          migrationClientConfig(migration, "production", readCertificate);
        } catch (error) {
          failure = error as Error;
        }
        expect(failure?.message).toBe(expectedMessage);
        expect(failure?.message).not.toContain(
          "/deployment/private database-ca.pem",
        );
        expect(failure?.message).not.toContain("private-ca-contents");
      }
    },
  );

  it.each([
    ["an unknown key", "sslmode=require&sslaccept=strict&connect_timeout=1"],
    ["duplicate sslmode", "sslmode=require&sslmode=require&sslaccept=strict"],
    ["duplicate sslaccept", "sslmode=require&sslaccept=strict&sslaccept=strict"],
    ["prefer", "sslmode=prefer&sslaccept=strict"],
    ["disable", "sslmode=disable&sslaccept=strict"],
    ["invalid certificates", "sslmode=require&sslaccept=accept_invalid_certs"],
    ["missing sslmode", "sslaccept=strict"],
    ["missing sslaccept", "sslmode=require"],
    ["alternate key casing", "SSLMODE=require&sslaccept=strict"],
    ["alternate value casing", "sslmode=REQUIRE&sslaccept=strict"],
    ["an empty root path", "sslmode=require&sslaccept=strict&sslrootcert="],
    [
      "a relative root path",
      "sslmode=require&sslaccept=strict&sslrootcert=ca.pem",
    ],
    [
      "a dot-relative root path",
      "sslmode=require&sslaccept=strict&sslrootcert=.%2Fca.pem",
    ],
    [
      "a parent-relative root path",
      "sslmode=require&sslaccept=strict&sslrootcert=..%2Fca.pem",
    ],
  ])("rejects %s", (_caseName, query) => {
    expect(() =>
      parseMigrationDatabaseUrl(
        `${productionMigrationBase}?${query}`,
        "production",
      ),
    ).toThrow();
  });

  it("rejects fragments without exposing the URL", () => {
    const value =
      `${productionMigrationBase}?sslmode=require&sslaccept=strict` +
      "#routing-override";
    try {
      parseMigrationDatabaseUrl(value, "production");
      throw new Error("Expected fragment rejection.");
    } catch (error) {
      expect((error as Error).message).toContain("does not allow URL fragments");
      expect((error as Error).message).not.toContain(value);
      expect((error as Error).message).not.toContain("admin-secret");
    }
  });

  it("keeps the existing query-free development migration URL behavior", () => {
    expect(
      parseMigrationDatabaseUrl(productionMigrationBase, "development").value,
    ).toBe(productionMigrationBase);
    expect(() =>
      parseMigrationDatabaseUrl(
        `${productionMigrationBase}?sslmode=require&sslaccept=strict`,
        "test",
      ),
    ).toThrow("does not allow query parameters");
  });

  it("requires distinct roles and production passwords", () => {
    const migration = parseMigrationDatabaseUrl(
      `${productionMigrationBase}?sslmode=require&sslaccept=strict`,
      "production",
    );
    const runtime = parseRuntimeDatabaseUrlForProvisioning(
      productionRuntimeBase,
    );
    expect(() =>
      assertDatabaseCredentialSeparation(migration, runtime, "production"),
    ).not.toThrow();

    const sameRole = parseRuntimeDatabaseUrlForProvisioning(
      "postgresql://valet_admin:runtime-secret@database.example:5432/valet",
    );
    expect(() =>
      assertDatabaseCredentialSeparation(migration, sameRole, "production"),
    ).toThrow("roles must be distinct");

    const samePassword = parseRuntimeDatabaseUrlForProvisioning(
      "postgresql://valet_runtime:admin-secret@database.example:5432/valet",
    );
    expect(() =>
      assertDatabaseCredentialSeparation(
        migration,
        samePassword,
        "production",
      ),
    ).toThrow("passwords must be distinct");
  });
});
