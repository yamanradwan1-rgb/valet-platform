import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

import { inspectWorker9Database, worker9RuntimePath } from "./issue215-worker9-pg-target.mjs";

const image = "postgres:17-alpine";
const owner = "issue215-worker9-final";
const docker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", timeout: 15_000, windowsHide: true, stdio: "pipe",
}).trim();
const mode = process.argv[2];
if (mode !== "start" && mode !== "stop") throw new Error("Expected start or stop.");

if (mode === "start") {
  if (existsSync(worker9RuntimePath) ||
      docker("ps", "-aq", "--filter", `label=vaylet.owner=${owner}`))
    throw new Error("Worker9 PG fixture already exists; refusing takeover.");
  const runId = randomBytes(16).toString("hex");
  const password = randomBytes(32).toString("hex");
  const name = `issue215-worker9-pg-${runId.slice(0, 12)}`;
  let id;
  try {
    id = docker(
      "run", "--detach", "--rm", "--name", name,
      "--label", `vaylet.owner=${owner}`,
      "--label", "vaylet.issue=215",
      "--label", "vaylet.task=287",
      "--label", `vaylet.run=${runId}`,
      "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw,size=134217728",
      "--env", `POSTGRES_USER=issue215_owner`,
      "--env", `POSTGRES_DB=issue215_empty`,
      "--env", `POSTGRES_PASSWORD=${password}`, image,
    );
    const observed = JSON.parse(docker("inspect", id))[0];
    const port = observed?.NetworkSettings?.Ports?.["5432/tcp"]?.[0]?.HostPort;
    if (!port || !/^\d+$/.test(port)) throw new Error("No private PG port.");
    const databaseUrl =
      `postgresql://issue215_owner:${password}@127.0.0.1:${port}/issue215_empty`;
    mkdirSync(dirname(worker9RuntimePath), { recursive: true });
    writeFileSync(worker9RuntimePath, JSON.stringify({
      containerId: id, containerName: name, runId, databaseUrl,
    }), { flag: "wx", mode: 0o600 });
    const env = {
      ...process.env,
      NODE_ENV: "test", VAYLET_ISSUE215_TEST_TARGET: "worker9",
      VAYLET_TEST_PROJECT: "api-postgres-issue215",
      VAYLET_TEST_RUN_ID: runId,
      VAYLET_ISSUE215_WORKER9_RUN_ID: runId,
      TEST_DATABASE_URL: databaseUrl,
    };
    inspectWorker9Database(env);
    let ready = false;
    for (let attempt = 0; attempt < 75; attempt++) {
      try {
        if (docker("exec", id, "pg_isready", "-U", "issue215_owner",
          "-d", "issue215_empty").includes("accepting connections")) {
          ready = true;
          break;
        }
      } catch { /* PostgreSQL is starting. */ }
      await pause(250);
    }
    if (!ready) throw new Error("Worker9 PG readiness deadline expired.");
    process.stdout.write("Worker9 isolated PG17 fixture READY.\n");
  } catch (error) {
    if (id) {
      try {
        const observed = JSON.parse(docker("inspect", id))[0];
        if (observed?.Id === id &&
            observed?.Config?.Labels?.["vaylet.run"] === runId)
          docker("stop", "--time", "3", id);
      } catch { /* Fail closed if identity cannot be proved. */ }
    }
    throw error;
  }
} else {
  if (!existsSync(worker9RuntimePath)) throw new Error("No worker9 ownership manifest.");
  const data = JSON.parse(readFileSync(worker9RuntimePath, "utf8"));
  const env = {
    ...process.env, NODE_ENV: "test", VAYLET_ISSUE215_TEST_TARGET: "worker9",
    VAYLET_TEST_PROJECT: "api-postgres-issue215",
    VAYLET_TEST_RUN_ID: data.runId,
    VAYLET_ISSUE215_WORKER9_RUN_ID: data.runId,
    TEST_DATABASE_URL: data.databaseUrl,
  };
  inspectWorker9Database(env);
  docker("stop", "--time", "5", data.containerId);
  if (docker("ps", "-aq", "--filter", `label=vaylet.owner=${owner}`))
    throw new Error("Worker9 PG container still present; preserving manifest.");
  unlinkSync(worker9RuntimePath);
  process.stdout.write("Worker9 isolated PG fixture STOPPED and removed.\n");
}
