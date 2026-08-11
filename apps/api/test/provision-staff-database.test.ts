import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  assertNonProductionLoopback,
  executeProvisioning,
  parseProvisioningArguments,
  persistProvisionedStaff,
  requireNodeEnvironment,
} from "../tools/provision-staff";

function validValues(): string[] {
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
    "staff.user@example.com",
    "--operator-ref",
    "CHANGE-123",
    "--reason",
    "Initial controlled provisioning",
    "--password-stdin",
  ];
}

function acceptedClient(input: ReturnType<typeof parseProvisioningArguments>) {
  return {
    connect: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string) => {
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
}

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
    const client = acceptedClient(input);
    client.connect.mockImplementation(async () => {
      events.push("connect");
    });
    client.query.mockImplementation(async (sql: string) => {
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
    });
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
    const execution = executeProvisioning(
      input,
      "fifteen-codepoints",
      {
        MIGRATION_DATABASE_URL:
          "postgresql://migration:password@localhost:5432/valet?sslmode=require&sslaccept=strict",
        NODE_ENV: "production",
      },
      {
        createClient: () => acceptedClient(input) as never,
        verifyTls: async () => {
          throw new Error(secret);
        },
      },
    );
    await expect(execution).rejects.toThrow("Staff provisioning failed");
    await expect(execution).rejects.not.toThrow(secret);
  });

  it.each([
    "INSERT INTO organization_memberships",
    "INSERT INTO membership_location_access",
    "INSERT INTO audit_events",
  ])("rolls back when %s fails", async (failedStatement) => {
    const input = parseProvisioningArguments(validValues());
    const statements: string[] = [];
    const client = acceptedClient(input);
    client.query.mockImplementation(async (sql: string) => {
      statements.push(sql);
      if (sql.startsWith(failedStatement)) {
        throw new Error("private SQL detail");
      }
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
    });
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
