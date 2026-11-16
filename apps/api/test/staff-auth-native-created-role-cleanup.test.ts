import { describe, expect, it } from "vitest";
import { dropFixtureCreatedRole } from "./staff-auth-native-writer-role-lifecycle";

const role = "vaylet_staff_auth_writer_fixture";
const grant = {
  parent: role,
  member: "valet_w66_migrator",
  grantor: "test_owner",
  admin: true,
  inherit: false,
  set: false,
};

function client(
  options: {
    readonly failDrop?: boolean;
    readonly refuseRemoval?: boolean;
  } = {},
) {
  const existing = new Set([role, "valet_w66_migrator"]);
  const memberships = [grant];
  const statements: string[] = [];
  return {
    existing,
    memberships,
    statements,
    async query(sql: string, args: unknown[] = []) {
      if (sql.includes("FROM pg_catalog.pg_roles WHERE rolname=$1")) {
        return { rowCount: existing.has(String(args[0])) ? 1 : 0, rows: [] };
      }
      if (sql.includes("FROM pg_catalog.pg_auth_members")) {
        return { rows: memberships, rowCount: memberships.length };
      }
      if (sql.startsWith("SELECT pg_catalog.format")) {
        const format = String(args[0]);
        statements.push(format);
        return { rows: [{ statement: `SQL_${statements.length}` }] };
      }
      if (sql.startsWith("SQL_")) {
        const statement = statements[Number(sql.slice(4)) - 1];
        if (statement === "REVOKE %I FROM %I GRANTED BY %I") {
          memberships.pop();
        }
        if (statement === "DROP ROLE %I") {
          if (options.failDrop) throw new Error("drop role failed");
          if (!options.refuseRemoval) existing.delete(role);
        }
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected query ${sql}`);
    },
  };
}

describe("fixture-owned role cleanup", () => {
  it("revokes memberships and DROP OWNED before dropping created role", async () => {
    const state = client();
    await dropFixtureCreatedRole(state, role);
    expect(state.statements).toEqual([
      "REVOKE %I FROM %I GRANTED BY %I",
      "DROP OWNED BY %I",
      "DROP ROLE %I",
    ]);
    expect(state.memberships).toHaveLength(0);
    expect(state.existing.has(role)).toBe(false);
    expect(state.existing.has("valet_w66_migrator")).toBe(true);
  });

  it("surfaces failed DROP ROLE and unresolved post-cleanup role", async () => {
    await expect(
      dropFixtureCreatedRole(client({ failDrop: true }), role),
    ).rejects.toThrow(/drop role failed/);
    await expect(
      dropFixtureCreatedRole(client({ refuseRemoval: true }), role),
    ).rejects.toThrow(/remains after cleanup/);
  });

  it("does not mutate a role which does not exist", async () => {
    const state = client();
    state.existing.delete(role);
    await dropFixtureCreatedRole(state, role);
    expect(state.statements).toEqual([]);
  });
});
