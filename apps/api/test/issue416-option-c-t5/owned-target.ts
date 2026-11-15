import { execFileSync } from "node:child_process";
import { Client } from "pg";

// These are fixed independently owned disposable PostgreSQL 17 targets. They
// are checked BEFORE the fixtures can create databases, roles or run migrations.
interface OwnedTarget {
  readonly containerName: string;
  readonly owner: string;
  readonly port: string;
  readonly database: string;
  readonly user: string;
  readonly flag: string;
  readonly flagValue: string;
}

const beforeTarget: OwnedTarget = {
  containerName: "vaylet-issue416-w37-option-c-20261115-pg17",
  owner: "issue416-w37-option-c-20261115",
  port: "51147",
  database: "valet_w37oc",
  user: "valet_w37oc",
  flag: "ISSUE416_OPTION_C_T5",
  flagValue: "W37_DISPOSABLE_ONLY",
};

const afterTarget: OwnedTarget = {
  containerName: "vaylet-issue416-w37-after-20261115-pg17",
  owner: "issue416-w37-after-20261115",
  port: "51157",
  database: "valet_w37after",
  user: "valet_w37after",
  flag: "ISSUE416_OPTION_C_AFTER",
  flagValue: "W37_AFTER_DISPOSABLE_ONLY",
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
  return assertOwnedPostgres17(afterTarget);
}

async function assertOwnedPostgres17(target: OwnedTarget): Promise<void> {
  const {
    containerName,
    owner,
    port: expectedPort,
    database: expectedDatabase,
    user: expectedUser,
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
      "W37 T5 requires explicit local disposable test ownership.",
    );
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url !== process.env.MIGRATION_DATABASE_URL) {
    throw new Error("W37 T5 requires one explicit admin test target.");
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
    throw new Error("W37 T5 PostgreSQL URL is outside owned fixture.");
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
    throw new Error("W37 T5 rejects remote or unrecognized Docker context.");
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
    !container?.Config?.Env?.includes(`POSTGRES_DB=${expectedDatabase}`) ||
    !container?.Config?.Env?.includes(`POSTGRES_USER=${expectedUser}`) ||
    container?.Mounts?.some(
      (mount: { Type: string }) => mount.Type === "bind",
    ) ||
    !Array.isArray(ports) ||
    ports.length !== 1 ||
    ports[0]?.HostIp !== "127.0.0.1" ||
    ports[0]?.HostPort !== expectedPort
  ) {
    throw new Error("W37 T5 Docker container identity mismatch.");
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
    throw new Error("W37 T5 container system identifier unavailable.");
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
      create_db: boolean;
      create_role: boolean;
    }>(`SELECT system_identifier::text, current_database() AS database,
               current_user AS principal, current_setting('server_version_num')::int AS version,
               pg_is_in_recovery() AS recovery, role.rolcreatedb AS create_db,
               role.rolcreaterole AS create_role
        FROM pg_control_system() CROSS JOIN pg_roles AS role WHERE role.rolname=current_user`);
    const proof = result.rows[0];
    if (
      result.rowCount !== 1 ||
      proof?.system_identifier !== inside ||
      proof.database !== expectedDatabase ||
      proof.principal !== expectedUser ||
      proof.version < 170000 ||
      proof.version >= 180000 ||
      proof.recovery ||
      !proof.create_db ||
      !proof.create_role
    ) {
      throw new Error("W37 T5 host SQL/postmaster identity mismatch.");
    }
    // Nothing about the exact system identifier is a secret, but do not log
    // environment variables, credential strings, or synthetic bearer hashes.
    console.info(
      `W37 attested Docker ${id.slice(0, 12)}; PG17 system ${inside}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
