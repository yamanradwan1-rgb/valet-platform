import { spawnSync } from "node:child_process";

import pg from "pg";

const POSTGRES_START_TIMEOUT_MS = 30_000;
const POSTGRES_POLL_INTERVAL_MS = 500;

export interface CommandOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly label: string;
}

export function runCommand(commandLine: string, options: CommandOptions): void {
  const result = spawnSync(commandLine, [], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: "inherit",
    windowsHide: true,
    shell: true,
  });
  if (result.error !== undefined) {
    throw new Error(
      `${options.label} could not start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${options.label} failed with exit code ${result.status ?? "signal"}.`,
    );
  }
}

export function runPnpmCommand(
  repositoryRoot: string,
  args: readonly string[],
  label: string,
  extraEnv: Record<string, string> = {},
): void {
  runCommand(["pnpm", ...args].join(" "), {
    cwd: repositoryRoot,
    env: { ...process.env, NODE_ENV: "development", ...extraEnv },
    label,
  });
}

export function ensureLocalPostgresService(repositoryRoot: string): void {
  const composeProbe = spawnSync("docker compose version", [], {
    stdio: "ignore",
    shell: true,
    windowsHide: true,
  });
  if (composeProbe.status !== 0) {
    throw new Error(
      "Docker with Compose v2 is required for the local PostgreSQL service. Start it manually and retry.",
    );
  }
  runCommand("docker compose up -d --no-recreate postgres", {
    cwd: repositoryRoot,
    label: "docker compose up postgres",
  });
}

export async function waitForPostgresDatabase(
  clientConfig: pg.ClientConfig,
  timeoutMs = POSTGRES_START_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new pg.Client(clientConfig);
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await sleep(POSTGRES_POLL_INTERVAL_MS);
    }
  }
  throw new Error(
    `Local PostgreSQL did not become reachable within ${timeoutMs} ms.`,
    { cause: lastError },
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
