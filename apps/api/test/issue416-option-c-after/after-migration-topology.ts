import { Pool } from "pg";

export const optionCTestMigratorRole = "valet_w66_migrator";

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
): Promise<void> {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await executeFormatted(
      owner,
      "GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO %I WITH GRANT OPTION",
      [databaseName, optionCTestMigratorRole],
    );
  } finally {
    await owner.end();
  }
  const databaseUrl = new URL(ownerUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new Pool({
    connectionString: databaseUrl.toString(),
    max: 1,
  });
  try {
    await executeFormatted(
      database,
      "GRANT USAGE, CREATE ON SCHEMA public TO %I WITH GRANT OPTION",
      [optionCTestMigratorRole],
    );
  } finally {
    await database.end();
  }
}

export async function ensureRuntimeRoleByOwner(
  ownerUrl: string,
  runtimeUrl: string,
): Promise<void> {
  const runtime = new URL(runtimeUrl);
  const role = decodeURIComponent(runtime.username);
  const password = decodeURIComponent(runtime.password);
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role) || !password) {
    throw new Error("W66 runtime test role identity is unsafe.");
  }
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    const found = await owner.query(
      "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1",
      [role],
    );
    if (found.rowCount !== 0)
      throw new Error("W66 runtime test role already exists.");
    await executeFormatted(
      owner,
      "CREATE ROLE %I WITH LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      [role, password],
    );
    await executeFormatted(
      owner,
      "GRANT %I TO %I WITH INHERIT FALSE, SET FALSE, ADMIN TRUE",
      [role, optionCTestMigratorRole],
    );
    const membership = await owner.query<{
      admin_option: boolean;
      inherit_option: boolean;
      set_option: boolean;
    }>(
      `SELECT membership.inherit_option,membership.set_option,membership.admin_option
         FROM pg_catalog.pg_auth_members membership
         JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
         JOIN pg_catalog.pg_roles member ON member.oid=membership.member
        WHERE parent.rolname=$1 AND member.rolname=$2`,
      [role, optionCTestMigratorRole],
    );
    const current = membership.rows[0];
    if (
      membership.rowCount !== 1 ||
      current?.admin_option !== true ||
      current.inherit_option !== false ||
      current.set_option !== false
    ) {
      throw new Error("W66 runtime provisioning ADMIN membership is unsafe.");
    }
    console.info(
      "W66 runtime provisioning membership admin=true set=false inherit=false",
    );
  } finally {
    await owner.end();
  }
}

export async function revokeRuntimeProvisioningAdmin(
  ownerUrl: string,
  runtimeUrl: string,
): Promise<void> {
  const role = decodeURIComponent(new URL(runtimeUrl).username);
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
    throw new Error("W66 runtime test role identity is unsafe.");
  }
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await executeFormatted(owner, "REVOKE %I FROM %I CASCADE", [
      role,
      optionCTestMigratorRole,
    ]);
    const remaining = await owner.query(
      `SELECT 1 FROM pg_catalog.pg_auth_members membership
         JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
         JOIN pg_catalog.pg_roles member ON member.oid=membership.member
        WHERE parent.rolname=$1 AND member.rolname=$2`,
      [role, optionCTestMigratorRole],
    );
    if (remaining.rowCount !== 0) {
      throw new Error(
        "W66 runtime provisioning ADMIN membership was not revoked.",
      );
    }
    console.info("W66 runtime provisioning membership revoked before cutover");
  } finally {
    await owner.end();
  }
}
