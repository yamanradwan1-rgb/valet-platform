import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

import { Pool } from "pg";
import {
  acquireDisposablePostgresOwnership,
  type DisposablePostgresOwnership,
} from "./guest-t3-disposable-ownership";

// The role-attribute negatives require an actual PostgreSQL superuser.
// This helper creates its own temporary server, bound to localhost only,
// so the shared CI migration/bootstrap role is never elevated.
const postgresImage = "postgres:17-alpine";
const disposableLabel = "vaylet.w3.disposable";

function docker(
  args: string[],
  context?: string,
  postgresPassword?: string,
): string {
  // Never inherit a remote Docker target override. Every operation after
  // selecting the local context pins that exact context explicitly.
  const environment = { ...process.env };
  delete environment.DOCKER_HOST;
  delete environment.DOCKER_CONTEXT;
  if (postgresPassword !== undefined) {
    environment.POSTGRES_PASSWORD = postgresPassword;
  }
  try {
    return execFileSync(
      "docker",
      context === undefined ? args : ["--context", context, ...args],
      {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  } catch (error) {
    // execFileSync's original Error can include stdout/stderr and argv.
    // The exception crossing the test boundary contains status only.
    const status = (error as { status?: unknown } | null)?.status;
    throw new Error(
      `Disposable PostgreSQL Docker command failed (exit ${typeof status === "number" ? status : "unknown"}).`,
    );
  }
}

function dockerContext(name: string): string {
  return docker([
    "context",
    "inspect",
    name,
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
}

function dockerMetadata(id: string, context: string): string {
  return docker(
    [
      "inspect",
      "--format",
      '{{.Id}}|{{.Config.Image}}|{{index .Config.Labels "vaylet.w3.disposable"}}|{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostIp}}|{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
      id,
    ],
    context,
  );
}

export async function startProductionDatabaseSafetyContainer(): Promise<{
  readonly adminUrl: string;
  readonly secondaryRunId?: string;
  readonly childEnvironment: Readonly<Record<string, string>>;
  readonly stop: () => Promise<void>;
}> {
  const name = `vaylet-db-safety-${process.pid}-${randomBytes(5).toString("hex")}`;
  const password = `safety-${randomUUID()}`;
  let containerId: string | undefined;
  let ownership: DisposablePostgresOwnership | undefined;
  let contextName: string | undefined;
  let initialContext: string | undefined;
  let initialMetadata: string | undefined;
  let attestedSystemId: string | undefined;
  let adminUrl: string | undefined;
  let running = false;
  const attestIdentity = async () => {
    if (
      containerId === undefined ||
      contextName === undefined ||
      dockerContext(contextName) !== initialContext ||
      dockerMetadata(containerId, contextName) !== initialMetadata
    ) {
      throw new Error("Disposable PostgreSQL Docker identity changed.");
    }
    // Before startup returns, only read-only readiness probes have run.
    // An early failure has no owned SQL resources to clean up.
    if (attestedSystemId === undefined || adminUrl === undefined) return;
    const probe = new Pool({
      connectionString: adminUrl,
      connectionTimeoutMillis: 1_500,
      max: 1,
    });
    try {
      const result = await probe.query<{ system_id: string }>(
        "SELECT system_identifier::text AS system_id FROM pg_control_system()",
      );
      if (
        result.rows.length !== 1 ||
        result.rows[0]?.system_id !== attestedSystemId
      ) {
        throw new Error("Disposable PostgreSQL system identity changed.");
      }
    } finally {
      await probe.end();
    }
  };
  const stop = async () => {
    if (!running) return;
    if (containerId === undefined) {
      throw new Error("Disposable PostgreSQL container identity is missing.");
    }
    await attestIdentity();
    // The secondary ledger owns every CREATE/DROP on this host/port.
    // Its cleanup must succeed while the attested server still exists.
    if (attestedSystemId !== undefined) {
      await ownership?.cleanup();
    }
    await attestIdentity();
    docker(["stop", "--time", "1", containerId], contextName);
    ownership?.release();
    running = false;
  };
  try {
    const selectedContext = docker(["context", "show"]);
    if (!/^[a-zA-Z0-9_.-]+$/.test(selectedContext)) {
      throw new Error("Disposable PostgreSQL Docker context is invalid.");
    }
    const context = dockerContext(selectedContext);
    if (
      context !== "unix:///var/run/docker.sock" &&
      !/^npipe:\/\/\/\/\.\/pipe\/(?:docker_engine|dockerDesktopLinuxEngine)$/.test(
        context,
      )
    ) {
      throw new Error("Disposable PostgreSQL requires a local Docker engine.");
    }
    contextName = selectedContext;
    initialContext = context;
    containerId = docker(
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        name,
        "--label",
        `${disposableLabel}=true`,
        "--publish",
        "127.0.0.1::5432",
        "--env",
        "POSTGRES_PASSWORD",
        postgresImage,
      ],
      contextName,
      password,
    );
    if (!/^[0-9a-f]{64}$/.test(containerId)) {
      throw new Error("Disposable PostgreSQL container ID is invalid.");
    }
    running = true;
    const metadata = dockerMetadata(containerId, contextName);
    const fields = metadata.split("|");
    if (
      fields.length !== 5 ||
      fields[0] !== containerId ||
      fields[1] !== postgresImage ||
      fields[2] !== "true" ||
      fields[3] !== "127.0.0.1" ||
      !/^\d{1,5}$/.test(fields[4] ?? "")
    ) {
      throw new Error(
        "Disposable PostgreSQL Docker metadata failed attestation.",
      );
    }
    initialMetadata = metadata;
    const port = fields[4]!;
    const url = new URL("postgresql://postgres@127.0.0.1/postgres");
    url.port = port;
    url.password = password;
    adminUrl = url.toString();
    // W4's test-only router denies unregistered endpoints. Register this
    // verified Docker server under a distinct lease before opening a Pool.
    ownership = await acquireDisposablePostgresOwnership(url.toString());
    const pool = new Pool({
      connectionString: url.toString(),
      connectionTimeoutMillis: 1_500,
      max: 1,
    });
    let ready = false;
    let lastFailure: unknown;
    const readyDeadline = Date.now() + 45_000;
    try {
      while (Date.now() < readyDeadline) {
        try {
          const result = await pool.query<{
            is_superuser: boolean;
            server_version: number;
            system_id: string;
          }>(
            `SELECT rolsuper AS is_superuser,
               current_setting('server_version_num')::integer AS server_version,
               (SELECT system_identifier::text FROM pg_control_system()) AS system_id
             FROM pg_roles WHERE rolname = current_user`,
          );
          if (
            result.rows[0]?.is_superuser !== true ||
            result.rows[0].server_version < 170000 ||
            result.rows[0].server_version >= 180000 ||
            !/^\d+$/.test(result.rows[0].system_id)
          ) {
            throw new Error(
              "Dedicated PostgreSQL identity or version failed attestation.",
            );
          }
          ready = true;
          attestedSystemId = result.rows[0].system_id;
          break;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("failed attestation")
          ) {
            throw error;
          }
          lastFailure = error;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    } finally {
      await pool.end();
    }
    if (!ready) {
      const code = (lastFailure as { code?: string } | undefined)?.code;
      throw new Error(
        `Dedicated PostgreSQL did not become ready (last DB error code: ${code ?? "unknown"}).`,
      );
    }
    return {
      adminUrl: url.toString(),
      ...(ownership === undefined ? {} : { secondaryRunId: ownership.runId }),
      childEnvironment:
        ownership === undefined
          ? {}
          : {
              VAYLET_TEST_RUN_ID: ownership.runId,
              TEST_DATABASE_URL: url.toString(),
            },
      stop,
    };
  } catch (error) {
    if (running) {
      try {
        await stop();
      } catch {
        // Preserve the setup failure; Docker's --rm owns final cleanup.
      }
    }
    throw error;
  }
}
