import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isLeaseHeartbeatFresh,
  startLeaseHeartbeat,
  stopLeaseHeartbeat,
} from "./lease-heartbeat.mjs";

const STATE_ROOT = join(tmpdir(), "vaylet-postgres-test-harness");

export function clusterIdentity(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("PostgreSQL test ownership requires a PostgreSQL URL.");
  }
  const port = parsed.port === "" ? "5432" : parsed.port;
  const rawHost = parsed.hostname.toLowerCase();
  const host = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(rawHost)
    ? "loopback"
    : rawHost;
  return `postgresql://${host}:${port}`;
}

export function clusterKey(databaseUrl) {
  return createHash("sha256")
    .update(clusterIdentity(databaseUrl))
    .digest("hex")
    .slice(0, 16);
}

export function createRunId(
  projectName,
  nonce = randomBytes(6).toString("hex"),
) {
  const project = safeToken(projectName).slice(0, 18);
  return `run_${project}_${process.pid.toString(36)}_${nonce}`.slice(0, 60);
}

export function currentWorkerId() {
  return safeToken(
    process.env.VITEST_POOL_ID ??
      process.env.VITEST_WORKER_ID ??
      `pid_${process.pid}`,
  ).slice(0, 24);
}

export function createOwnedResourceName({
  fixtureId,
  kind,
  nonce = randomBytes(4).toString("hex"),
  runId,
  workerId,
}) {
  const digest = createHash("sha256")
    .update(`${runId}:${workerId}:${fixtureId}:${kind}:${nonce}`)
    .digest("hex")
    .slice(0, 20);
  const prefix = kind === "role" ? "vlt_t_role" : "vlt_t_db";
  return `${prefix}_${digest}`;
}

export function acquireClusterLease({
  databaseUrl,
  projectName,
  runId,
  stateRoot = STATE_ROOT,
}) {
  const key = clusterKey(databaseUrl);
  const clusterDir = join(stateRoot, key);
  const ownerPath = join(clusterDir, "owner.json");
  mkdirSync(clusterDir, { recursive: true });
  mkdirSync(runDirectory(databaseUrl, runId, stateRoot), { recursive: true });
  let staleOwner;
  for (;;) {
    const tempPath = join(
      clusterDir,
      `owner-${process.pid}-${randomBytes(6).toString("hex")}.tmp`,
    );
    try {
      writeFileSync(
        tempPath,
        JSON.stringify({
          cluster: clusterIdentity(databaseUrl),
          pid: process.pid,
          projectName,
          recoveryRunIds:
            staleOwner === undefined
              ? []
              : [staleOwner.runId, ...(staleOwner.recoveryRunIds ?? [])],
          runId,
          startedAt: new Date().toISOString(),
        }),
        { flag: "wx" },
      );
      linkSync(tempPath, ownerPath);
      unlinkSync(tempPath);
      startLeaseHeartbeat(clusterDir, runId);
      return { clusterDir, ownerPath, staleOwner, stateRoot };
    } catch (error) {
      try {
        unlinkSync(tempPath);
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") throw cleanupError;
      }
      if (error?.code !== "EEXIST") throw error;
      const existing = readOwner(ownerPath);
      if (
        isProcessAlive(existing.pid) &&
        isLeaseHeartbeatFresh(clusterDir, existing.runId, existing.startedAt)
      ) {
        throw new Error(
          `PostgreSQL test cluster ${existing.cluster} is already owned by ` +
            `${existing.projectName} (pid ${existing.pid}, run ${existing.runId}). ` +
            "Use a separate test cluster or wait for that invocation to finish.",
        );
      }
      staleOwner = existing;
      stopLeaseHeartbeat(clusterDir, existing.runId);
      try {
        unlinkSync(ownerPath);
      } catch (unlinkError) {
        if (unlinkError?.code !== "ENOENT") throw unlinkError;
      }
    }
  }
}

export function assertClusterLeaseOwner({
  databaseUrl,
  runId,
  stateRoot = STATE_ROOT,
}) {
  const ownerPath = join(stateRoot, clusterKey(databaseUrl), "owner.json");
  if (!existsSync(ownerPath)) {
    throw new Error(
      `PostgreSQL test run ${runId} has no active cluster ownership metadata.`,
    );
  }
  const owner = readOwner(ownerPath);
  const clusterDir = join(stateRoot, clusterKey(databaseUrl));
  if (
    owner.runId !== runId ||
    !isProcessAlive(owner.pid) ||
    !isLeaseHeartbeatFresh(clusterDir, owner.runId, owner.startedAt)
  ) {
    throw new Error(
      `PostgreSQL test run ${runId} does not match the active cluster owner.`,
    );
  }
  return owner;
}

export function releaseClusterLease({
  databaseUrl,
  runId,
  stateRoot = STATE_ROOT,
}) {
  const ownerPath = join(stateRoot, clusterKey(databaseUrl), "owner.json");
  if (!existsSync(ownerPath)) return;
  const owner = readOwner(ownerPath);
  if (owner.runId !== runId) {
    throw new Error(
      `Refusing to release PostgreSQL test lease owned by ${owner.runId}.`,
    );
  }
  stopLeaseHeartbeat(join(stateRoot, clusterKey(databaseUrl)), runId);
  unlinkSync(ownerPath);
}

export function appendOwnershipEvent({
  databaseUrl,
  event,
  runId,
  stateRoot = STATE_ROOT,
  workerId = currentWorkerId(),
}) {
  const dir = runDirectory(databaseUrl, runId, stateRoot);
  mkdirSync(dir, { recursive: true });
  const resourceId =
    ["resource-planned", "resource-created"].includes(event.type) &&
    event.resourceId === undefined
      ? createHash("sha256")
          .update(`${runId}:${workerId}:${event.kind}:${event.name}`)
          .digest("hex")
          .slice(0, 20)
      : event.resourceId;
  appendFileSync(
    join(dir, `worker-${safeToken(workerId)}.jsonl`),
    `${JSON.stringify({ ...event, ...(resourceId === undefined ? {} : { resourceId }), at: Date.now(), workerId })}\n`,
  );
}

export function readOwnershipEvents({
  databaseUrl,
  runId,
  stateRoot = STATE_ROOT,
}) {
  const dir = runDirectory(databaseUrl, runId, stateRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .flatMap((name) => parseEventFile(join(dir, name)));
}

export function removeRunState({ databaseUrl, runId, stateRoot = STATE_ROOT }) {
  rmSync(runDirectory(databaseUrl, runId, stateRoot), {
    recursive: true,
    force: true,
  });
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function testHarnessStateRoot() {
  return STATE_ROOT;
}

function runDirectory(databaseUrl, runId, stateRoot) {
  return join(stateRoot, clusterKey(databaseUrl), "runs", safeToken(runId));
}

function readOwner(path) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      `PostgreSQL test ownership metadata is unreadable at ${path}.`,
    );
  }
  if (
    !Number.isInteger(value?.pid) ||
    typeof value?.runId !== "string" ||
    typeof value?.cluster !== "string" ||
    (value?.recoveryRunIds !== undefined &&
      (!Array.isArray(value.recoveryRunIds) ||
        value.recoveryRunIds.some((item) => typeof item !== "string")))
  ) {
    throw new Error(
      `PostgreSQL test ownership metadata is invalid at ${path}.`,
    );
  }
  return value;
}

function parseEventFile(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      break;
    }
  }
  return events;
}

function safeToken(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}
