export interface WriterRoleMembershipState {
  readonly parent: string;
  readonly member: string;
  readonly grantor: string;
  readonly admin: boolean;
  readonly inherit: boolean;
  readonly set: boolean;
}

interface MembershipQueryClient {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount?: number | null;
  }>;
}

function membershipKey(row: WriterRoleMembershipState): string {
  return JSON.stringify([row.parent, row.member, row.grantor]);
}

function membershipEqual(
  left: WriterRoleMembershipState | undefined,
  right: WriterRoleMembershipState | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export async function readWriterRoleMemberships(
  client: MembershipQueryClient,
  roles: string[],
): Promise<WriterRoleMembershipState[]> {
  if (roles.length === 0) return [];
  const result = await client.query(
    `SELECT parent.rolname AS parent,member.rolname AS member,
            grantor.rolname AS grantor,membership.admin_option AS admin,
            membership.inherit_option AS inherit,membership.set_option AS set
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid=membership.member
       JOIN pg_catalog.pg_roles grantor ON grantor.oid=membership.grantor
      WHERE parent.rolname=ANY($1::text[]) OR member.rolname=ANY($1::text[])`,
    [roles],
  );
  return result.rows.map((row) => ({
    parent: String(row.parent),
    member: String(row.member),
    grantor: String(row.grantor),
    admin: row.admin as boolean,
    inherit: row.inherit as boolean,
    set: row.set as boolean,
  }));
}

async function executeFormatted(
  client: MembershipQueryClient,
  format: string,
  values: string[],
): Promise<void> {
  const placeholders = values
    .map((_, index) => `$${index + 2}::text`)
    .join(",");
  const result = await client.query(
    `SELECT pg_catalog.format($1,${placeholders}) AS statement`,
    [format, ...values],
  );
  const statement = result.rows[0]?.statement;
  if (typeof statement !== "string") {
    throw new Error("Fixture membership cleanup SQL is invalid.");
  }
  await client.query(statement);
}

export async function restoreWriterRoleMemberships(
  client: MembershipQueryClient,
  roles: string[],
  original: WriterRoleMembershipState[],
  after: WriterRoleMembershipState[],
  afterCaptured: boolean,
): Promise<void> {
  if (roles.length === 0) return;
  const current = await readWriterRoleMemberships(client, roles);
  const originalByKey = new Map(
    original.map((row) => [membershipKey(row), row]),
  );
  const afterByKey = new Map(
    (afterCaptured ? after : original).map((row) => [membershipKey(row), row]),
  );
  const currentByKey = new Map(current.map((row) => [membershipKey(row), row]));
  const keys = new Set([
    ...originalByKey.keys(),
    ...afterByKey.keys(),
    ...currentByKey.keys(),
  ]);
  const conflicts: string[] = [];
  for (const key of keys) {
    const before = originalByKey.get(key);
    const written = afterByKey.get(key);
    const present = currentByKey.get(key);
    if (membershipEqual(present, before)) continue;
    if (!membershipEqual(present, written)) {
      conflicts.push(key);
      continue;
    }
    if (present) {
      await executeFormatted(client, "REVOKE %I FROM %I GRANTED BY %I", [
        present.parent,
        present.member,
        present.grantor,
      ]);
    }
    if (before) {
      await executeFormatted(
        client,
        "GRANT %I TO %I WITH ADMIN %s, INHERIT %s, SET %s GRANTED BY %I",
        [
          before.parent,
          before.member,
          before.admin ? "TRUE" : "FALSE",
          before.inherit ? "TRUE" : "FALSE",
          before.set ? "TRUE" : "FALSE",
          before.grantor,
        ],
      );
    }
  }
  if (conflicts.length > 0) {
    throw new Error(
      `Protected writer membership changed outside fixture ownership: ${conflicts.join(", ")}`,
    );
  }
}
