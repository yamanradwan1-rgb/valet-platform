import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { describe, expect, it, vi } from "vitest";

import { isAcceptedStaffPasswordHash } from "../src/modules/auth/staff-auth.service";
import {
  assertNonProductionLoopback,
  executeProvisioning,
  hashProvisioningPassword,
  normalizeProvisioningIdentity,
  parseProvisioningArguments,
  passwordFromStdin,
  persistProvisionedStaff,
  readProvisioningPassword,
  requireNodeEnvironment,
} from "../tools/provision-staff";

function validValues(overrides: string[] = []): string[] {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  return [
    "--organization-id",
    organizationId,
    "--location-id",
    locationId,
    "--audit-location-id",
    locationId,
    "--role",
    "VALET_EMPLOYEE",
    "--email",
    " Staff.User@Example.COM ",
    "--operator-ref",
    "CHANGE-123",
    "--reason",
    "Initial controlled provisioning",
    "--password-stdin",
    ...overrides,
  ];
}

describe("controlled staff provisioning input", () => {
  it("uses Staff Auth normalization exactly", () => {
    expect(
      normalizeProvisioningIdentity(
        " Staff.User@Example.COM ",
        "fifteen-codepoints",
      ).email,
    ).toBe("staff.user@example.com");
    expect(() =>
      normalizeProvisioningIdentity("not-email", "fifteen-codepoints"),
    ).toThrow("Invalid staff email or password");
  });

  it.each([
    "ORG_ADMIN",
    "LOCATION_MANAGER",
    "VALET_SUPERVISOR",
    "VALET_EMPLOYEE",
  ])("accepts role %s", (role) => {
    const values = validValues();
    values[values.indexOf("VALET_EMPLOYEE")] = role;
    expect(parseProvisioningArguments(values).role).toBe(role);
  });

  it("rejects unknown and duplicate singleton flags", () => {
    expect(() =>
      parseProvisioningArguments(validValues(["--password", "secret"])),
    ).toThrow("Unknown");
    expect(() =>
      parseProvisioningArguments(validValues(["--role", "ORG_ADMIN"])),
    ).toThrow("Duplicate");
  });

  it("rejects an unknown role", () => {
    const values = validValues();
    values[values.indexOf("VALET_EMPLOYEE")] = "INVALID";
    expect(() => parseProvisioningArguments(values)).toThrow(
      "Invalid staff role",
    );
  });

  it("requires the stdin marker", () => {
    expect(() =>
      parseProvisioningArguments(
        validValues().filter((value) => value !== "--password-stdin"),
      ),
    ).toThrow("stdin");
  });

  it("does not accept password files, environment flags, or environment fallbacks", async () => {
    expect(() =>
      parseProvisioningArguments(
        validValues(["--password-file", "secret.txt"]),
      ),
    ).toThrow("Unknown");
    expect(() =>
      parseProvisioningArguments(
        validValues(["--password-env", "STAFF_PASSWORD"]),
      ),
    ).toThrow("Unknown");
    await expect(
      executeProvisioning(parseProvisioningArguments(validValues()), "", {
        MIGRATION_DATABASE_URL:
          "postgresql://migration:password@localhost:5432/valet",
        NODE_ENV: "test",
        STAFF_PASSWORD: "fifteen-codepoints",
      }),
    ).rejects.toThrow("Invalid staff email or password");
  });

  it("rejects duplicate and missing Location scope", () => {
    const parsed = validValues();
    const locationId = parsed[parsed.indexOf("--location-id") + 1];
    if (locationId === undefined) throw new Error("Invalid test fixture.");
    expect(() =>
      parseProvisioningArguments([...parsed, "--location-id", locationId]),
    ).toThrow("Duplicate Location");
    const withoutLocation = parsed.filter(
      (_value, index) =>
        index !== parsed.indexOf("--location-id") &&
        index !== parsed.indexOf("--location-id") + 1,
    );
    expect(() => parseProvisioningArguments(withoutLocation)).toThrow(
      "At least one Location",
    );
  });

  it("requires the audit Location within granted scope", () => {
    const values = validValues();
    values[values.indexOf("--audit-location-id") + 1] = randomUUID();
    expect(() => parseProvisioningArguments(values)).toThrow("Audit Location");
  });

  it("rejects control characters and invalid UUIDs before database work", () => {
    const controlled = validValues();
    controlled[controlled.indexOf("--reason") + 1] = "bad\nreason";
    expect(() => parseProvisioningArguments(controlled)).toThrow(
      "Invalid provisioning reason",
    );
    const values = validValues();
    values[values.indexOf("--organization-id") + 1] = "not-a-uuid";
    expect(() => parseProvisioningArguments(values)).toThrow(
      "Invalid Organization ID",
    );
  });

  it("rejects C1 controls while accepting ordinary Unicode operator text", () => {
    for (const flag of ["--operator-ref", "--reason"]) {
      const controlled = validValues();
      controlled[controlled.indexOf(flag) + 1] = "before\u0085after";
      expect(() => parseProvisioningArguments(controlled)).toThrow("Invalid");
    }
    const unicode = validValues();
    unicode[unicode.indexOf("--operator-ref") + 1] = "مشغّل-١٢٣";
    unicode[unicode.indexOf("--reason") + 1] = "إنشاء حساب موظف";
    expect(parseProvisioningArguments(unicode)).toMatchObject({
      operatorRef: "مشغّل-١٢٣",
      reason: "إنشاء حساب موظف",
    });
  });
});

describe("provisioning password boundary", () => {
  it("fails closed for interactive stdin", () => {
    expect(() => passwordFromStdin("fifteen-codepoints", true)).toThrow(
      "non-interactive",
    );
  });

  it("fails before invoking the password reader for interactive stdin", async () => {
    const read = vi.fn(async () => "fifteen-codepoints");
    await expect(readProvisioningPassword(true, read)).rejects.toThrow(
      "non-interactive",
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("removes exactly one terminal LF or CRLF", () => {
    expect(passwordFromStdin("fifteen-codepoints\n", false)).toBe(
      "fifteen-codepoints",
    );
    expect(passwordFromStdin("fifteen-codepoints\r\n", false)).toBe(
      "fifteen-codepoints",
    );
    expect(() => passwordFromStdin("fifteen-codepoints\n\n", false)).toThrow(
      "line breaks",
    );
  });

  it("preserves leading and trailing spaces", () => {
    expect(passwordFromStdin("  fifteen-codepoints  \n", false)).toBe(
      "  fifteen-codepoints  ",
    );
  });

  it("rejects embedded CR/LF", () => {
    expect(() => passwordFromStdin("fifteen\ncodepoints", false)).toThrow();
    expect(() => passwordFromStdin("fifteen\rcodepoints", false)).toThrow();
  });

  it("counts Unicode code points and applies length bounds", () => {
    expect(passwordFromStdin("a".repeat(15), false)).toHaveLength(15);
    expect(passwordFromStdin("😀".repeat(15), false)).toBe("😀".repeat(15));
    expect(() => passwordFromStdin("a".repeat(14), false)).toThrow();
    expect(() => passwordFromStdin("a".repeat(129), false)).toThrow();
    expect(() => passwordFromStdin("😀".repeat(300), false)).toThrow();
  });

  it("does not impose character composition rules", () => {
    expect(passwordFromStdin("a".repeat(15), false)).toBe("a".repeat(15));
  });

  it("creates the exact accepted Argon2id verifier", async () => {
    const password = "  exact provisioning password  ";
    const passwordHash = await hashProvisioningPassword(password);
    expect(isAcceptedStaffPasswordHash(passwordHash)).toBe(true);
    await expect(argon2.verify(passwordHash, password)).resolves.toBe(true);
  });
});

describe("provisioning database safety", () => {
  it.each(["production", "development", "test"])(
    "accepts explicit NODE_ENV=%s",
    (value) => expect(requireNodeEnvironment(value)).toBe(value),
  );

  it("rejects omitted and invalid NODE_ENV", () => {
    expect(() => requireNodeEnvironment(undefined)).toThrow("NODE_ENV");
    expect(() => requireNodeEnvironment("staging")).toThrow("NODE_ENV");
  });

  it.each(["localhost", "127.0.0.1", "::1", "[::1]"])(
    "accepts non-production loopback host %s",
    (host) =>
      expect(() => assertNonProductionLoopback("test", host)).not.toThrow(),
  );

  it("rejects a non-production remote host", () => {
    expect(() =>
      assertNonProductionLoopback("development", "database.example.com"),
    ).toThrow("loopback");
  });

  it("verifies TLS before BEGIN or mutation", async () => {
    const events: string[] = [];
    const input = parseProvisioningArguments(validValues());
    const client = {
      connect: vi.fn(async () => {
        events.push("connect");
      }),
      end: vi.fn(async () => undefined),
      query: vi.fn(async (sql: string) => {
        events.push(sql);
        if (sql.startsWith("SELECT status")) {
          return { rowCount: 1, rows: [{ status: "ACTIVE" }] };
        }
        if (sql.startsWith("SELECT id::text")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: input.locationIds[0],
                organization_id: input.organizationId,
                status: "ACTIVE",
              },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      }),
    };
    await executeProvisioning(
      input,
      "fifteen-codepoints",
      {
        MIGRATION_DATABASE_URL:
          "postgresql://migration:secret@localhost:5432/valet?sslmode=require&sslaccept=strict",
        NODE_ENV: "production",
      },
      {
        createClient: () => client as never,
        verifyTls: async () => {
          events.push("verify-tls");
        },
      },
    );
    expect(events.indexOf("verify-tls")).toBeLessThan(events.indexOf("BEGIN"));
  });

  it("maps connection/TLS failures without disclosing supplied secrets", async () => {
    const secret = "secret-database-detail";
    const input = parseProvisioningArguments(validValues());
    await expect(
      executeProvisioning(
        input,
        "fifteen-codepoints",
        {
          MIGRATION_DATABASE_URL:
            "postgresql://migration:password@localhost:5432/valet?sslmode=require&sslaccept=strict",
          NODE_ENV: "production",
        },
        {
          createClient: () =>
            ({
              connect: async () => undefined,
              end: async () => undefined,
              query: async () => ({ rowCount: 0, rows: [] }),
            }) as never,
          verifyTls: async () => {
            throw new Error(secret);
          },
        },
      ),
    ).rejects.toThrow("Staff provisioning failed");
    await expect(
      executeProvisioning(
        input,
        "fifteen-codepoints",
        {
          MIGRATION_DATABASE_URL:
            "postgresql://migration:password@localhost:5432/valet?sslmode=require&sslaccept=strict",
          NODE_ENV: "production",
        },
        {
          createClient: () =>
            ({
              connect: async () => undefined,
              end: async () => undefined,
              query: async () => ({ rowCount: 0, rows: [] }),
            }) as never,
          verifyTls: async () => {
            throw new Error(secret);
          },
        },
      ),
    ).rejects.not.toThrow(secret);
  });

  it.each([
    "INSERT INTO organization_memberships",
    "INSERT INTO membership_location_access",
    "INSERT INTO audit_events",
  ])("rolls back when %s fails", async (failedStatement) => {
    const input = parseProvisioningArguments(validValues());
    const statements: string[] = [];
    const client = {
      connect: async () => undefined,
      end: async () => undefined,
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.startsWith(failedStatement))
          throw new Error("private SQL detail");
        if (sql.startsWith("SELECT status")) {
          return { rowCount: 1, rows: [{ status: "ACTIVE" }] };
        }
        if (sql.startsWith("SELECT id::text")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: input.locationIds[0],
                organization_id: input.organizationId,
                status: "ACTIVE",
              },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };
    await expect(
      persistProvisionedStaff(
        client as never,
        input,
        "staff@example.com",
        "accepted-hash-placeholder",
      ),
    ).rejects.toThrow("Staff provisioning failed");
    expect(statements.at(-1)).toBe("ROLLBACK");
  });
});
