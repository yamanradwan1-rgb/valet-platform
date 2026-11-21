import { execFileSync } from "node:child_process";
import { Client } from "pg";

import {
  ownedTargetMembershipsAreSafe,
  type OwnedTargetMembership,
} from "./owned-target-memberships";

// These are fixed independently owned disposable PostgreSQL 17 targets. They
// are checked BEFORE the fixtures can create databases, roles or run migrations.
interface OwnedTarget {
  readonly containerName: string;
  readonly owner: string;
  readonly port: string;
  readonly database: string;
  readonly user: string;
  readonly bootstrapDatabase?: string;
  readonly bootstrapUser?: string;
  readonly volumeName?: string;
  readonly allowedParentRoles: readonly string[];
  readonly allowedCreatorAdminParentRoles?: readonly string[];
  readonly flag: string;
  readonly flagValue: string;
}

const beforeTarget: OwnedTarget = {
  containerName: "vaylet-issue416-w37-option-c-20261115-pg17",
  owner: "issue416-w37-option-c-20261115",
  port: "51147",
  database: "valet_w37oc",
  user: "valet_w37oc",
  allowedParentRoles: ["pg_monitor"],
  flag: "ISSUE416_OPTION_C_T5",
  flagValue: "W37_DISPOSABLE_ONLY",
};

const afterTarget: OwnedTarget = {
  containerName: "vaylet-issue416-option-c-final-20261116-pg17",
  owner: "issue416-option-c-final-20261116",
  port: "51800",
  database: "valet_w66final4",
  user: "valet_w66final4",
  bootstrapDatabase: "postgres",
  bootstrapUser: "postgres",
  volumeName: "vaylet_optionc_final_pg17_data",
  allowedParentRoles: ["pg_monitor"],
  allowedCreatorAdminParentRoles: ["valet_w66_migrator"],
  flag: "ISSUE416_OPTION_C_AFTER",
  flagValue: "OPTION_C_FINAL_DISPOSABLE_ONLY",
};

const finalHttpTarget: OwnedTarget = {
  containerName: "vaylet-option-c-final-http-20261117-pg17",
  owner: "option-c-final-http-20261117",
  port: "52717",
  database: "valet_optionc_http",
  user: "valet_optionc_http",
  bootstrapDatabase: "postgres",
  bootstrapUser: "postgres",
  volumeName: "vaylet-option-c-final-http-20261117-data",
  allowedParentRoles: ["pg_monitor"],
  allowedCreatorAdminParentRoles: ["valet_w66_migrator"],
  flag: "ISSUE416_OPTION_C_FINAL_HTTP",
  flagValue: "OPTION_C_FINAL_HTTP_DISPOSABLE_ONLY",
};

function docker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 8_000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function assertOwnedOptionCPg17(): Promise<void> {
  return assertOwnedPostgres17(beforeTarget);
}

export function assertOwnedOptionCAfterPg17(): Promise<void> {
  const historicalAfter =
    process.env[afterTarget.flag] === afterTarget.flagValue;
  const finalHttp =
    process.env[finalHttpTarget.flag] === finalHttpTarget.flagValue;
  if (historicalAfter === finalHttp) {
    return Promise.reject(
      new Error(
        "Option C AFTER requires exactly one hard-coded disposable target.",
      ),
    );
  }
  return assertOwnedPostgres17(finalHttp ? finalHttpTarget : afterTarget);
}

async function assertOwnedPostgres17(target: OwnedTarget): Promise<void> {
  const {
    containerName,
    owner,
    port: expectedPort,
    database: expectedDatabase,
    user: expectedUser,
    bootstrapDatabase = expectedDatabase,
    bootstrapUser = expectedUser,
    volumeName,
  } = target;
  if (
    process.env[target.flag] !== target.flagValue ||
    process.env.NODE_ENV !== "test" ||
    process.env.CI !== undefined ||
    ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"].some((name) =>
      Boolean(process.env[name]),
    )
  ) {
    throw new Error(
      "Option C PG17 requires explicit local disposable test ownership.",
    );
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url !== process.env.MIGRATION_DATABASE_URL) {
    throw new Error("Option C PG17 requires one explicit admin test target.");
  }
  const targetUrl = new URL(url);
  if (
    targetUrl.protocol !== "postgresql:" ||
    targetUrl.hostname !== "127.0.0.1" ||
    targetUrl.port !== expectedPort ||
    targetUrl.pathname !== `/${expectedDatabase}` ||
    targetUrl.username !== expectedUser ||
    !targetUrl.password ||
    targetUrl.search !== "" ||
    targetUrl.hash !== ""
  ) {
    throw new Error("Option C PG17 PostgreSQL URL is outside owned fixture.");
  }

  const currentContext = docker(["context", "show"]);
  const context = JSON.parse(docker(["context", "inspect", currentContext]));
  const endpoint = context?.[0]?.Endpoints?.docker?.Host;
  if (
    ![
      "npipe:////./pipe/dockerDesktopLinuxEngine",
      "npipe:////./pipe/docker_engine",
    ].includes(endpoint)
  ) {
    throw new Error(
      "Option C PG17 rejects remote or unrecognized Docker context.",
    );
  }
  const inspected = JSON.parse(docker(["inspect", containerName]));
  const container = inspected?.length === 1 ? inspected[0] : undefined;
  const ports = container?.NetworkSettings?.Ports?.["5432/tcp"];
  if (
    container?.Name !== `/${containerName}` ||
    container?.Config?.Image !== "postgres:17-alpine" ||
    container?.State?.Status !== "running" ||
    container?.Config?.Labels?.["vaylet.owner"] !== owner ||
    container?.Config?.Labels?.["vaylet.environment"] !== "isolated-test" ||
    container?.Config?.Labels?.["vaylet.disposable"] !== "true" ||
    container?.Config?.Labels?.["vaylet.issue"] !== "416" ||
    !container?.Config?.Env?.includes(`POSTGRES_DB=${bootstrapDatabase}`) ||
    !container?.Config?.Env?.includes(`POSTGRES_USER=${bootstrapUser}`) ||
    container?.HostConfig?.RestartPolicy?.Name !== "no" ||
    container?.Mounts?.some(
      (mount: { Type: string }) => mount.Type === "bind",
    ) ||
    (volumeName !== undefined &&
      (container?.Mounts?.length !== 1 ||
        container.Mounts[0]?.Type !== "volume" ||
        container.Mounts[0]?.Name !== volumeName)) ||
    !Array.isArray(ports) ||
    ports.length !== 1 ||
    ports[0]?.HostIp !== "127.0.0.1" ||
    ports[0]?.HostPort !== expectedPort
  ) {
    throw new Error("Option C PG17 Docker container identity mismatch.");
  }

  const id = container.Id as string;
  const inside = docker([
    "exec",
    id,
    "psql",
    "-U",
    expectedUser,
    "-d",
    expectedDatabase,
    "-At",
    "-c",
    "SELECT system_identifier::text FROM pg_control_system()",
  ]);
  if (!/^\d{10,25}$/.test(inside)) {
    throw new Error("Option C PG17 container system identifier unavailable.");
  }

  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 4_000,
  });
  try {
    await client.connect();
    const result = await client.query<{
      system_identifier: string;
      database: string;
      principal: string;
      version: number;
      recovery: boolean;
      superuser: boolean;
      create_db: boolean;
      create_role: boolean;
      replication: boolean;
      bypass_rls: boolean;
      inherit: boolean;
      memberships: OwnedTargetMembership[];
    }>(`SELECT (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
               current_database() AS database,
               current_user AS principal, current_setting('server_version_num')::int AS version,
               pg_is_in_recovery() AS recovery, role.rolsuper AS superuser,
               role.rolcreatedb AS create_db, role.rolcreaterole AS create_role,
               role.rolreplication AS replication, role.rolbypassrls AS bypass_rls,
               role.rolinherit AS inherit,
               coalesce((SELECT jsonb_agg(jsonb_build_object(
                   'parent',parent.rolname::text,
                   'grantor_superuser',grantor.rolsuper,
                   'inherit_option',membership.inherit_option,
                   'set_option',membership.set_option,
                   'admin_option',membership.admin_option
                 ) ORDER BY parent.rolname,grantor.rolname)
                 FROM pg_auth_members AS membership
                 JOIN pg_roles AS parent ON parent.oid=membership.roleid
                 JOIN pg_roles AS grantor ON grantor.oid=membership.grantor
                 WHERE membership.member=role.oid), '[]'::jsonb) AS memberships
        FROM pg_roles AS role
        WHERE role.rolname=current_user`);
    const proof = result.rows[0];
    if (
      result.rowCount !== 1 ||
      proof?.system_identifier !== inside ||
      proof.database !== expectedDatabase ||
      proof.principal !== expectedUser ||
      proof.version < 170000 ||
      proof.version >= 180000 ||
      proof.recovery ||
      proof.superuser ||
      !proof.create_db ||
      !proof.create_role ||
      proof.replication ||
      proof.bypass_rls ||
      proof.inherit ||
      !ownedTargetMembershipsAreSafe(
        proof.memberships,
        target.allowedParentRoles,
        target.allowedCreatorAdminParentRoles,
      )
    ) {
      throw new Error("Option C PG17 host SQL/postmaster identity mismatch.");
    }
    // Nothing about the exact system identifier is a secret, but do not log
    // environment variables, credential strings, or synthetic bearer hashes.
    console.info(
      `${owner} attested Docker ${id.slice(0, 12)}; PG17 system ${inside}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
