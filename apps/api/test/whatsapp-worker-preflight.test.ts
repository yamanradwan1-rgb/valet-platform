import { describe, expect, it, vi } from "vitest";
import {
  assertOutboundSenderPrivileges,
} from "../src/modules/notifications/worker/outbound-sender-preflight";

function privileges(overrides: Record<string, unknown> = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM pg_roles")) return { rowCount: 1, rows: [{
      rolsuper: false, rolcreatedb: false, rolcreaterole: false,
      rolreplication: false, rolbypassrls: false, rolinherit: false,
      owns_database: false, owns_public_objects: false,
      role_member_count: 0, can_create: false,
      ...overrides,
    }] };
    if (sql.includes("has_function_privilege")) return {
      rowCount: 1, rows: [{ allowed: overrides.allowed ?? true }],
    };
    return { rowCount: 1, rows: [{ unsafe: overrides.unsafe ?? false }] };
  });
  return { query };
}

describe("WhatsApp sender database privilege preflight", () => {
  it("verifies actual sender function grants and prohibits business-table writes", async () => {
    const pg = privileges();
    await expect(assertOutboundSenderPrivileges(pg as never)).resolves.toBeUndefined();
    expect(pg.query.mock.calls.some(([sql]) => sql.includes("has_function_privilege")))
      .toBe(true);
    expect(pg.query.mock.calls.some(([sql]) => sql.includes("has_table_privilege")))
      .toBe(true);
  });

  it.each([
    [{ rolsuper: true }, "OUTBOUND_SENDER_ROLE_UNSAFE"],
    [{ rolinherit: true }, "OUTBOUND_SENDER_ROLE_UNSAFE"],
    [{ owns_public_objects: true }, "OUTBOUND_SENDER_ROLE_UNSAFE"],
    [{ role_member_count: 1 }, "OUTBOUND_SENDER_ROLE_UNSAFE"],
    [{ unsafe: true }, "OUTBOUND_SENDER_TABLE_PRIVILEGES_UNSAFE"],
    [{ allowed: false }, "OUTBOUND_SENDER_FUNCTION_NOT_READY"],
  ] as const)("fails closed when database permissions are unsafe", async (override, code) => {
    await expect(assertOutboundSenderPrivileges(privileges(override) as never))
      .rejects.toThrow(code);
  });
});
