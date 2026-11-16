import {
  readWriterRoleMemberships,
  restoreWriterRoleMemberships,
  type WriterRoleMembershipState,
} from "./staff-auth-native-writer-role-memberships";

const fixedWriterRoles = new Set([
  "vaylet_staff_auth_writer",
  "vaylet_mfa_writer",
  "vaylet_management_writer",
  "valet_w66_migrator",
  "vaylet_staff_session_lock_owner",
]);

interface FixtureRoleQueryResult {
  readonly rows: Array<Record<string, unknown>>;
  readonly rowCount?: number | null;
}

interface FixtureRoleQueryClient {
  query(sql: string, values?: unknown[]): Promise<FixtureRoleQueryResult>;
}

interface RoleAuthState {
  readonly password: string | null;
  readonly canLogin: boolean;
  readonly inherit: boolean;
}

export interface FixtureWriterRoleSnapshot {
  readonly role: string;
  readonly existed: boolean;
  readonly original?: RoleAuthState;
  readonly after?: RoleAuthState;
  readonly originalMemberships: WriterRoleMembershipState[];
  readonly afterMemberships?: WriterRoleMembershipState[];
}

function writerRoles(writers: Record<string, string>): string[] {
  return [
    writers.STAFF_AUTH_WRITER_DATABASE_URL,
    writers.MANAGEMENT_WRITER_DATABASE_URL,
    writers.MFA_WRITER_DATABASE_URL,
  ]
    .filter((url): url is string => Boolean(url))
    .map((url) => {
      const role = decodeURIComponent(new URL(url).username);
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
        throw new Error("Fixture writer role name is unsafe.");
      }
      return role;
    })
    .filter((role, index, roles) => roles.indexOf(role) === index);
}

async function readRoleAuth(
  client: FixtureRoleQueryClient,
  roles: string[],
): Promise<Map<string, RoleAuthState>> {
  if (roles.length === 0) return new Map();
  const result = await client.query(
    `SELECT rolname,rolpassword,rolcanlogin,rolinherit
       FROM pg_catalog.pg_authid WHERE rolname=ANY($1::text[])`,
    [roles],
  );
  return new Map<string, RoleAuthState>(
    result.rows.map((row) => [
      String(row.rolname),
      {
        password: row.rolpassword as string | null,
        canLogin: row.rolcanlogin as boolean,
        inherit: row.rolinherit as boolean,
      },
    ]),
  );
}

export async function captureFixtureWriterRoleBaseline(
  client: FixtureRoleQueryClient,
  writers: Record<string, string>,
  extraRoles: string[] = [],
): Promise<FixtureWriterRoleSnapshot[]> {
  if (extraRoles.some((role) => !/^[a-z_][a-z0-9_]{0,62}$/.test(role))) {
    throw new Error("Fixture protected role name is unsafe.");
  }
  const roles = [...new Set([...writerRoles(writers), ...extraRoles])];
  if (roles.length === 0) return [];
  const existing = await client.query(
    "SELECT rolname FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])",
    [roles],
  );
  const present = new Set(existing.rows.map((row) => String(row.rolname)));
  for (const role of roles) {
    if (present.has(role) && !fixedWriterRoles.has(role)) {
      throw new Error(
        `Per-fixture Staff Auth writer role already exists: ${role}`,
      );
    }
  }
  const original = await readRoleAuth(
    client,
    roles.filter((role) => present.has(role)),
  );
  if (original.size !== present.size) {
    throw new Error(
      "Cannot snapshot every pre-existing protected writer credential.",
    );
  }
  const originalMemberships = await readWriterRoleMemberships(client, [
    ...present,
  ]);
  return roles.map((role) => ({
    role,
    existed: present.has(role),
    ...(original.has(role) ? { original: original.get(role)! } : {}),
    originalMemberships: originalMemberships.filter(
      (membership) => membership.parent === role || membership.member === role,
    ),
  }));
}

export async function captureFixtureWriterRolePostState(
  client: FixtureRoleQueryClient,
  snapshots: FixtureWriterRoleSnapshot[],
): Promise<FixtureWriterRoleSnapshot[]> {
  const existingRoles = snapshots
    .filter((item) => item.existed)
    .map((item) => item.role);
  const after = await readRoleAuth(client, existingRoles);
  if (after.size !== existingRoles.length) {
    throw new Error(
      "A pre-existing protected writer role disappeared during fixture setup.",
    );
  }
  const afterMemberships = await readWriterRoleMemberships(
    client,
    existingRoles,
  );
  return snapshots.map((item) => ({
    ...item,
    ...(item.existed ? { after: after.get(item.role)! } : {}),
    ...(item.existed
      ? {
          afterMemberships: afterMemberships.filter(
            (membership) =>
              membership.parent === item.role ||
              membership.member === item.role,
          ),
        }
      : {}),
  }));
}

export function fixtureCreatedWriterRoles(
  snapshots: FixtureWriterRoleSnapshot[],
): string[] {
  return snapshots.filter((item) => !item.existed).map((item) => item.role);
}

async function executeFormatted(
  client: FixtureRoleQueryClient,
  format: string,
  values: unknown[],
) {
  const placeholders = values
    .map((_, index) => `$${index + 2}::text`)
    .join(",");
  const result = await client.query(
    `SELECT pg_catalog.format($1,${placeholders}) AS statement`,
    [format, ...values],
  );
  const statement = result.rows[0]?.statement;
  if (typeof statement !== "string")
    throw new Error("Fixture role cleanup SQL is invalid.");
  await client.query(statement);
}

export async function dropFixtureCreatedRole(
  client: FixtureRoleQueryClient,
  role: string,
): Promise<void> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
    throw new Error("Fixture cleanup role name is unsafe.");
  }
  const exists = await client.query(
    "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1",
    [role],
  );
  if (exists.rowCount === 0) return;
  const memberships = await readWriterRoleMemberships(client, [role]);
  for (const membership of memberships) {
    await executeFormatted(client, "REVOKE %I FROM %I GRANTED BY %I", [
      membership.parent,
      membership.member,
      membership.grantor,
    ]);
  }
  await executeFormatted(client, "DROP OWNED BY %I", [role]);
  await executeFormatted(client, "DROP ROLE %I", [role]);
  const remaining = await client.query(
    "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1",
    [role],
  );
  if (remaining.rowCount !== 0) {
    throw new Error(`Fixture created role remains after cleanup: ${role}`);
  }
}

export async function restoreFixtureWriterRoles(
  client: FixtureRoleQueryClient,
  snapshots: FixtureWriterRoleSnapshot[],
): Promise<void> {
  const roles = snapshots.map((item) => item.role);
  const existing = await client.query(
    "SELECT rolname FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])",
    [roles],
  );
  const present = new Set(existing.rows.map((row) => String(row.rolname)));
  const existingProtectedRoles = snapshots
    .filter((item) => item.existed && present.has(item.role))
    .map((item) => item.role);
  const originalMemberships = snapshots.flatMap(
    (item) => item.originalMemberships,
  );
  const afterMemberships = snapshots.flatMap(
    (item) => item.afterMemberships ?? [],
  );
  await restoreWriterRoleMemberships(
    client,
    existingProtectedRoles,
    originalMemberships,
    afterMemberships,
    snapshots.some((item) => item.afterMemberships !== undefined),
  );
  const auth = await readRoleAuth(
    client,
    snapshots
      .filter((item) => item.existed && present.has(item.role))
      .map((item) => item.role),
  );
  const conflicts: string[] = [];
  for (const item of snapshots) {
    if (!item.existed) {
      if (present.has(item.role)) {
        await dropFixtureCreatedRole(client, item.role);
      }
      continue;
    }
    if (!present.has(item.role) || !item.original) {
      conflicts.push(item.role);
      continue;
    }
    const current = auth.get(item.role)!;
    const after = item.after ?? item.original;
    const restore: string[] = [];
    const values: unknown[] = [item.role];
    if (current.password !== item.original.password) {
      if (current.password === after.password) {
        restore.push("PASSWORD %L");
        values.push(item.original.password);
      } else conflicts.push(`${item.role}:password`);
    }
    for (const field of ["canLogin", "inherit"] as const) {
      if (current[field] === item.original[field]) continue;
      if (current[field] !== after[field]) {
        conflicts.push(`${item.role}:${field}`);
        continue;
      }
      restore.push(
        field === "canLogin"
          ? item.original.canLogin
            ? "LOGIN"
            : "NOLOGIN"
          : item.original.inherit
            ? "INHERIT"
            : "NOINHERIT",
      );
    }
    if (restore.length > 0) {
      await executeFormatted(
        client,
        `ALTER ROLE %I WITH ${restore.join(" ")}`,
        values,
      );
    }
  }
  if (conflicts.length > 0) {
    throw new Error(
      `Protected writer role changed outside fixture ownership: ${conflicts.join(", ")}`,
    );
  }
}
