import { Client, Pool } from "pg";

import { dropFixtureCreatedRole } from "../staff-auth-native-writer-role-lifecycle";

export const optionCTestMigratorRole = "valet_w66_migrator";

const migrationOwnedRoles = [
  "vap1_proof_owner",
  "valet_photo_evidence_lock_owner",
];

export async function findAbsentMigrationOwnedRoles(
  client: Client,
): Promise<string[]> {
  const existing = await client.query<{ rolname: string }>(
    "SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])",
    [migrationOwnedRoles],
  );
  const present = new Set(existing.rows.map(({ rolname }) => rolname));
  return migrationOwnedRoles.filter((role) => !present.has(role));
}

export async function restoreMigrationOwnedRoles(
  connectionString: string,
  newRoles: string[],
): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    for (const role of newRoles) await dropFixtureCreatedRole(client, role);
  } finally {
    await client.end();
  }
}

async function executeFormatted(
  pool: Pool,
  format: string,
  values: string[],
): Promise<void> {
  const placeholders = values
    .map((_, index) => `$${index + 2}::text`)
    .join(",");
  const built = await pool.query<{ statement: string }>(
    `SELECT pg_catalog.format($1,${placeholders}) AS statement`,
    [format, ...values],
  );
  const statement = built.rows[0]?.statement;
  if (!statement)
    throw new Error("W66 migration topology SQL formatting failed.");
  await pool.query(statement);
}

export function migrationBaseUrl(ownerUrl: string, password: string): string {
  const url = new URL(ownerUrl);
  url.username = optionCTestMigratorRole;
  url.password = password;
  return url.toString();
}

export async function ensureMigrationRole(
  ownerUrl: string,
  password: string,
): Promise<void> {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    const found = await owner.query<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
               rolreplication,rolbypassrls
          FROM pg_catalog.pg_roles WHERE rolname=$1`,
      [optionCTestMigratorRole],
    );
    if (found.rowCount === 0) {
      await executeFormatted(
        owner,
        "CREATE ROLE %I WITH LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS",
        [optionCTestMigratorRole, password],
      );
      return;
    }
    const role = found.rows[0];
    if (
      !role?.rolcanlogin ||
      role.rolinherit ||
      role.rolsuper ||
      role.rolcreatedb ||
      !role.rolcreaterole ||
      role.rolreplication ||
      role.rolbypassrls
    ) {
      throw new Error("W66 existing migration role attributes are unsafe.");
    }
    await executeFormatted(owner, "ALTER ROLE %I WITH PASSWORD %L", [
      optionCTestMigratorRole,
      password,
    ]);
  } finally {
    await owner.end();
  }
}

export async function grantMigrationDatabase(
  ownerUrl: string,
  databaseName: string,
  migrationPassword: string,
): Promise<void> {
  const ownerRole = decodeURIComponent(new URL(ownerUrl).username);
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(ownerRole)) {
    throw new Error("W66 fixture owner role identity is unsafe.");
  }
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await executeFormatted(
      owner,
      "REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC",
      [databaseName],
    );
    await executeFormatted(
      owner,
      "GRANT %I TO %I WITH INHERIT FALSE, SET TRUE",
      [optionCTestMigratorRole, ownerRole],
    );
    const memberships = await owner.query<{
      admin_option: boolean;
      grantor_role: string;
      grantor_superuser: boolean;
      inherit_option: boolean;
      set_option: boolean;
    }>(
      `SELECT membership.inherit_option,membership.set_option,
              membership.admin_option,grantor.rolname AS grantor_role,
              grantor.rolsuper AS grantor_superuser
         FROM pg_catalog.pg_auth_members membership
         JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
         JOIN pg_catalog.pg_roles member ON member.oid=membership.member
         JOIN pg_catalog.pg_roles grantor ON grantor.oid=membership.grantor
        WHERE parent.rolname=$1 AND member.rolname=$2
        ORDER BY grantor.rolname`,
      [optionCTestMigratorRole, ownerRole],
    );
    const creatorAdmin = memberships.rows.filter(
      (row) =>
        row.admin_option === true &&
        row.set_option === false &&
        row.inherit_option === false &&
        row.grantor_superuser === true,
    );
    const cleanupSet = memberships.rows.filter(
      (row) =>
        row.admin_option === false &&
        row.set_option === true &&
        row.inherit_option === false &&
        row.grantor_role === ownerRole,
    );
    if (
      memberships.rowCount !== 2 ||
      creatorAdmin.length !== 1 ||
      cleanupSet.length !== 1
    ) {
      throw new Error(
        "W66 fixture owner-to-migrator administrative memberships are unsafe.",
      );
    }
    await executeFormatted(owner, "ALTER DATABASE %I OWNER TO %I", [
      databaseName,
      optionCTestMigratorRole,
    ]);
  } finally {
    await owner.end();
  }
  const databaseUrl = new URL(migrationBaseUrl(ownerUrl, migrationPassword));
  databaseUrl.pathname = `/${databaseName}`;
  const database = new Pool({
    connectionString: databaseUrl.toString(),
    max: 1,
  });
  try {
    await executeFormatted(database, "ALTER SCHEMA public OWNER TO %I", [
      optionCTestMigratorRole,
    ]);
    await database.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  } finally {
    await database.end();
  }
}
