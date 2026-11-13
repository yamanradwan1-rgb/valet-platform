import { createRequire } from "node:module";

import { TARGET } from "./target-contract.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));

function refuse(reason) {
  throw new Error(`Issue416 isolated-PG17 SQL attestation refused: ${reason}.`);
}

export function assertSqlIdentity(identity, expectedRole) {
  if (identity?.database !== TARGET.database ||
      identity.database_owner !== TARGET.owner ||
      identity.actor !== expectedRole || identity.session_role !== expectedRole ||
      identity.server_port !== 5432 ||
      identity.accepts_connections !== true || identity.recovery !== false ||
      !Number.isInteger(identity.server_version) ||
      identity.server_version < 170000 || identity.server_version >= 180000 ||
      typeof identity.server_started !== "string" || !identity.server_started ||
      identity.is_superuser !== false || identity.can_create_db !== false ||
      identity.can_create_role !== false || identity.can_bypass_rls !== false ||
      identity.can_replicate !== false || identity.inherits_owner !== false) {
    refuse(`database/version/owner/role for ${expectedRole}`);
  }
  return identity.server_started;
}

const SQL = `
SELECT current_database() AS database,
       current_user AS actor,
       session_user AS session_role,
       pg_get_userbyid(d.datdba) AS database_owner,
       inet_server_port() AS server_port,
       current_setting('server_version_num')::integer AS server_version,
       pg_postmaster_start_time()::text AS server_started,
       pg_is_in_recovery() AS recovery,
       d.datallowconn AS accepts_connections,
       r.rolsuper AS is_superuser,
       r.rolcreatedb AS can_create_db,
       r.rolcreaterole AS can_create_role,
       r.rolbypassrls AS can_bypass_rls,
       r.rolreplication AS can_replicate,
       pg_has_role(current_user, $1::name, 'MEMBER') AS inherits_owner
FROM pg_database d
JOIN pg_roles r ON r.rolname = current_user
WHERE d.datname = current_database()`;

export async function attestPostgresRoles(urls, ClientCtor = require("pg").Client) {
  const startTimes = [];
  for (const [key, [expectedRole]] of Object.entries(TARGET.roles)) {
    const client = new ClientCtor({
      connectionString: urls[key],
      connectionTimeoutMillis: 3000,
      query_timeout: 3000,
      statement_timeout: 3000,
      ssl: false,
    });
    try {
      await client.connect();
      const result = await client.query(SQL, [TARGET.owner]);
      if (result.rows?.length !== 1) refuse("identity row count");
      startTimes.push(assertSqlIdentity(result.rows[0], expectedRole));
    } finally {
      await client.end().catch(() => {});
    }
  }
  if (new Set(startTimes).size !== 1) refuse("roles reach different clusters");
  return Object.freeze({ serverStarted: startTimes[0] });
}
