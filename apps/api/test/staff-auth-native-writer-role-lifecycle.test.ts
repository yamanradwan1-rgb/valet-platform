import { describe, expect, it } from "vitest";

import {
  captureFixtureWriterRoleBaseline,
  captureFixtureWriterRolePostState,
  restoreFixtureWriterRoles,
} from "./staff-auth-native-writer-role-lifecycle";

const staffRole = "vaylet_staff_auth_writer_test_123";
const managementRole = "vaylet_management_writer";
const writers = {
  STAFF_AUTH_WRITER_DATABASE_URL: `postgresql://${staffRole}:fixture-secret@127.0.0.1:5432/fixture`,
  MANAGEMENT_WRITER_DATABASE_URL: `postgresql://${managementRole}:management-secret@127.0.0.1:5432/fixture`,
};

function roleClient(
  initial: Record<
    string,
    {
      password: string | null;
      canLogin: boolean;
      inherit: boolean;
    }
  >,
  membershipRows: Array<{
    parent: string;
    member: string;
    grantor: string;
    admin: boolean;
    inherit: boolean;
    set: boolean;
  }> = [],
) {
  const roles = new Map(Object.entries(initial));
  const formatted: Array<{ format: string; values: unknown[] }> = [];
  const executed: string[] = [];
  return {
    formatted,
    executed,
    roles,
    async query(sql: string, values: unknown[] = []) {
      const names = values[0] as string[] | undefined;
      if (sql.includes("FROM pg_catalog.pg_auth_members")) {
        return {
          rows: membershipRows.filter(
            (membership) =>
              names?.includes(membership.parent) ||
              names?.includes(membership.member),
          ),
        };
      }
      if (sql.includes("FROM pg_catalog.pg_roles WHERE rolname=ANY")) {
        return {
          rows: (names ?? [])
            .filter((name) => roles.has(name))
            .map((rolname) => ({ rolname })),
        };
      }
      if (sql.includes("FROM pg_catalog.pg_roles WHERE rolname=$1")) {
        return {
          rows: roles.has(String(values[0])) ? [{ one: 1 }] : [],
          rowCount: roles.has(String(values[0])) ? 1 : 0,
        };
      }
      if (sql.includes("FROM pg_catalog.pg_authid WHERE rolname=ANY")) {
        return {
          rows: (names ?? []).flatMap((rolname) => {
            const role = roles.get(rolname);
            return role
              ? [
                  {
                    rolname,
                    rolpassword: role.password,
                    rolcanlogin: role.canLogin,
                    rolinherit: role.inherit,
                  },
                ]
              : [];
          }),
        };
      }
      if (sql.includes("SELECT pg_catalog.format")) {
        formatted.push({
          format: values[0] as string,
          values: values.slice(1),
        });
        return { rows: [{ statement: `FORMATTED_${formatted.length}` }] };
      }
      if (sql.startsWith("FORMATTED_")) {
        executed.push(sql);
        const last = formatted[Number(sql.slice("FORMATTED_".length)) - 1];
        if (last?.format === "DROP ROLE %I")
          roles.delete(String(last.values[0]));
        return { rows: [] };
      }
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    },
  };
}

describe("native fixture protected writer role lifecycle", () => {
  it("restores only the credentials and attributes changed by the fixture", async () => {
    const original = {
      password: "SCRAM-SHA-256$original",
      canLogin: true,
      inherit: true,
    };
    const beforeClient = roleClient({ [managementRole]: original });
    const baseline = await captureFixtureWriterRoleBaseline(
      beforeClient,
      writers,
    );
    expect(baseline).toEqual([
      { role: staffRole, existed: false, originalMemberships: [] },
      {
        role: managementRole,
        existed: true,
        original,
        originalMemberships: [],
      },
    ]);

    const afterClient = roleClient({
      [managementRole]: {
        password: "SCRAM-SHA-256$fixture",
        canLogin: true,
        inherit: false,
      },
    });
    const after = await captureFixtureWriterRolePostState(
      afterClient,
      baseline,
    );

    const cleanup = roleClient({
      [staffRole]: {
        password: "SCRAM-SHA-256$fixture-staff",
        canLogin: true,
        inherit: false,
      },
      [managementRole]: after[1]!.after!,
    });
    await restoreFixtureWriterRoles(cleanup, after);

    expect(cleanup.formatted).toEqual([
      { format: "DROP OWNED BY %I", values: [staffRole] },
      { format: "DROP ROLE %I", values: [staffRole] },
      {
        format: "ALTER ROLE %I WITH PASSWORD %L INHERIT",
        values: [managementRole, original.password],
      },
    ]);
    expect(cleanup.executed).toEqual([
      "FORMATTED_1",
      "FORMATTED_2",
      "FORMATTED_3",
    ]);
    expect(cleanup.roles.has(staffRole)).toBe(false);
  });

  it("preserves a pre-existing role when its credential changed outside the fixture", async () => {
    const original = { password: "old-hash", canLogin: true, inherit: true };
    const baseline = await captureFixtureWriterRoleBaseline(
      roleClient({ [managementRole]: original }),
      {
        MANAGEMENT_WRITER_DATABASE_URL: writers.MANAGEMENT_WRITER_DATABASE_URL,
      },
    );
    const after = await captureFixtureWriterRolePostState(
      roleClient({
        [managementRole]: {
          password: "fixture-hash",
          canLogin: true,
          inherit: false,
        },
      }),
      baseline,
    );
    const cleanup = roleClient({
      [managementRole]: {
        password: "external-hash",
        canLogin: true,
        inherit: false,
      },
    });
    await expect(restoreFixtureWriterRoles(cleanup, after)).rejects.toThrow(
      /changed outside fixture ownership/,
    );
    expect(cleanup.formatted).toEqual([
      { format: "ALTER ROLE %I WITH INHERIT", values: [managementRole] },
    ]);
  });

  it("restores fixture-changed memberships with their original PG17 options", async () => {
    const original = { password: "old-hash", canLogin: true, inherit: true };
    const originalMembership = {
      parent: managementRole,
      member: "migration_role",
      grantor: "migration_role",
      admin: true,
      inherit: false,
      set: false,
    };
    const addedMembership = {
      parent: managementRole,
      member: "temporary_member",
      grantor: "migration_role",
      admin: false,
      inherit: false,
      set: false,
    };
    const baseline = await captureFixtureWriterRoleBaseline(
      roleClient({ [managementRole]: original }, [originalMembership]),
      {
        MANAGEMENT_WRITER_DATABASE_URL: writers.MANAGEMENT_WRITER_DATABASE_URL,
      },
    );
    const after = await captureFixtureWriterRolePostState(
      roleClient(
        {
          [managementRole]: {
            password: "fixture-hash",
            canLogin: true,
            inherit: false,
          },
        },
        [{ ...originalMembership, admin: false }, addedMembership],
      ),
      baseline,
    );
    const cleanup = roleClient(
      {
        [managementRole]: after[0]!.after!,
      },
      [{ ...originalMembership, admin: false }, addedMembership],
    );
    await restoreFixtureWriterRoles(cleanup, after);
    expect(cleanup.formatted).toEqual([
      {
        format: "REVOKE %I FROM %I GRANTED BY %I",
        values: [managementRole, "migration_role", "migration_role"],
      },
      {
        format:
          "GRANT %I TO %I WITH ADMIN %s, INHERIT %s, SET %s GRANTED BY %I",
        values: [
          managementRole,
          "migration_role",
          "TRUE",
          "FALSE",
          "FALSE",
          "migration_role",
        ],
      },
      {
        format: "REVOKE %I FROM %I GRANTED BY %I",
        values: [managementRole, "temporary_member", "migration_role"],
      },
      {
        format: "ALTER ROLE %I WITH PASSWORD %L INHERIT",
        values: [managementRole, original.password],
      },
    ]);
  });

  it("cleans only newly created roles after a partial provisioning failure", async () => {
    const original = { password: "old-hash", canLogin: true, inherit: true };
    const baseline = await captureFixtureWriterRoleBaseline(
      roleClient({ [managementRole]: original }),
      writers,
    );
    const cleanup = roleClient({
      [staffRole]: { password: "partial-hash", canLogin: true, inherit: false },
      [managementRole]: original,
    });
    await restoreFixtureWriterRoles(cleanup, baseline);
    expect(cleanup.formatted).toEqual([
      { format: "DROP OWNED BY %I", values: [staffRole] },
      { format: "DROP ROLE %I", values: [staffRole] },
    ]);
    expect(cleanup.roles.has(staffRole)).toBe(false);
  });

  it("fails before provisioning if a per-fixture role name already exists", async () => {
    await expect(
      captureFixtureWriterRoleBaseline(
        roleClient({
          [staffRole]: { password: "unknown", canLogin: true, inherit: false },
        }),
        {
          STAFF_AUTH_WRITER_DATABASE_URL:
            writers.STAFF_AUTH_WRITER_DATABASE_URL,
        },
      ),
    ).rejects.toThrow(/already exists/);
  });
});
