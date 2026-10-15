import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { Client } from "pg";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { RuntimeDatabaseLifecycle } from "../src/common/database/runtime-database.module";
import { withDatabaseOperationDeadline } from "../src/common/database/runtime-database-deadline";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";

interface DockerInspection {
  Id: string;
  Image: string;
  Name: string;
  Config: { Image: string; Labels: Record<string, string> };
  NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[]> };
  HostConfig: { Tmpfs: Record<string, string> };
  State: { Status: string };
  Mounts: unknown[];
}

async function main(): Promise<void> {
const id = process.env.ISSUE215_PG17_CONTAINER_ID;
const url = process.env.ISSUE215_PG17_DATABASE_URL;
const imageId = process.env.ISSUE215_PG17_IMAGE_ID;
if (!id || !url || !imageId || process.env.NODE_ENV !== "test")
  throw new Error("Explicit owned PostgreSQL 17 smoke attestation is required.");

const inspected = JSON.parse(execFileSync("docker", ["inspect", id], {
  encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe",
})) as DockerInspection[];
const container = inspected[0];
const parsed = new URL(url);
const port = container?.NetworkSettings?.Ports?.["5432/tcp"];
assert.equal(container?.Id, id);
assert.equal(container?.Name, `/${process.env.ISSUE215_PG17_CONTAINER_NAME}`);
assert.equal(container?.Image, imageId);
assert.equal(container?.Config?.Image, "postgres:17-alpine");
assert.equal(container?.Config?.Labels?.["vaylet.owner"], "issue215-worker9");
assert.equal(container?.Config?.Labels?.["vaylet.task"], "287");
assert.equal(container?.State?.Status, "running");
assert.equal(port?.[0]?.HostIp, "127.0.0.1");
assert.equal(port?.[0]?.HostPort, parsed.port);
assert.ok(container?.HostConfig?.Tmpfs?.["/var/lib/postgresql/data"]);
assert.deepEqual(container?.Mounts, []);
assert.equal(parsed.hostname, "127.0.0.1");
assert.equal(parsed.pathname, "/postgres");

const pool = createRuntimePostgresPool(url, { ...process.env, NODE_ENV: "test" });
try {
  await new RuntimeDatabaseLifecycle(pool).onApplicationBootstrap();
  const client = await pool.connect();
  try {
    const setting = await client.query<{
      version: number; transaction_timeout: string;
    }>(`SELECT current_setting('server_version_num')::int AS version,
              current_setting('transaction_timeout') AS transaction_timeout`);
    assert.ok(setting.rows[0]!.version >= 170000);
    assert.ok(setting.rows[0]!.version < 180000);
    assert.equal(setting.rows[0]!.transaction_timeout, "30s");
  } finally {
    client.release();
  }
  await withDatabaseOperationDeadline(() =>
    inPostgresTransaction(pool, async (transaction) => {
      const settings = await transaction.query<{ timeout: string }>(
        "SELECT current_setting('transaction_timeout') AS timeout",
      );
      const timeout = settings.rows[0]!.timeout;
      const milliseconds = timeout.endsWith("s")
        ? Number.parseFloat(timeout) * 1_000
        : Number.parseFloat(timeout);
      assert.ok(milliseconds > 0 && milliseconds <= 5_000, timeout);
    }),
  );
  const bare = new Client({ connectionString: url });
  await bare.connect();
  try {
    await bare.query("SET transaction_timeout = '200ms'");
    await bare.query("BEGIN");
    await assert.rejects(
      () => bare.query("SELECT pg_sleep(1)"),
      (error: unknown) => (error as { code?: string }).code === "25P04",
    );
  } finally {
    await bare.end().catch(() => undefined);
  }
} finally {
  await pool.end();
}
}

void main().catch(() => {
  process.stderr.write("Owned PG17 runtime smoke failed.\n");
  process.exitCode = 1;
});
