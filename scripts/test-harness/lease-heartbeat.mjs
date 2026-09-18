import {
  existsSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const HEARTBEAT_INTERVAL_MS = 1_000;
const HEARTBEAT_MAX_AGE_MS = 30_000;
const activeHeartbeats = new Map();

export function startLeaseHeartbeat(clusterDir, runId) {
  writeHeartbeat(clusterDir, runId);
  const timer = setInterval(
    () => writeHeartbeat(clusterDir, runId),
    HEARTBEAT_INTERVAL_MS,
  );
  timer.unref();
  activeHeartbeats.set(runId, timer);
}

export function stopLeaseHeartbeat(clusterDir, runId) {
  const timer = activeHeartbeats.get(runId);
  if (timer !== undefined) clearInterval(timer);
  activeHeartbeats.delete(runId);
  removeHeartbeatFiles(clusterDir, runId);
}

export function isLeaseHeartbeatFresh(clusterDir, runId, startedAt) {
  const latest = latestHeartbeat(clusterDir, runId);
  if (latest !== null && Date.now() - latest <= HEARTBEAT_MAX_AGE_MS) {
    return true;
  }
  const started = Date.parse(startedAt);
  return (
    Number.isFinite(started) && Date.now() - started <= HEARTBEAT_MAX_AGE_MS
  );
}

function writeHeartbeat(clusterDir, runId) {
  const at = Date.now();
  const temp = join(clusterDir, `.heartbeat-${process.pid}-${at}.tmp`);
  const target = join(clusterDir, heartbeatName(runId, at));
  writeFileSync(temp, `${runId}\n`, { flag: "wx" });
  renameSync(temp, target);
  removeHeartbeatFiles(clusterDir, runId, target);
}

function latestHeartbeat(clusterDir, runId) {
  if (!existsSync(clusterDir)) return null;
  const prefix = heartbeatPrefix(runId);
  let latest = null;
  for (const name of readdirSync(clusterDir)) {
    if (!name.startsWith(prefix)) continue;
    const value = Number(name.slice(prefix.length, -5));
    if (Number.isFinite(value) && (latest === null || value > latest)) {
      latest = value;
    }
  }
  return latest;
}

function removeHeartbeatFiles(clusterDir, runId, keepPath) {
  if (!existsSync(clusterDir)) return;
  const prefix = heartbeatPrefix(runId);
  for (const name of readdirSync(clusterDir)) {
    if (!name.startsWith(prefix)) continue;
    const path = join(clusterDir, name);
    if (path === keepPath) continue;
    try {
      unlinkSync(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function heartbeatName(runId, at) {
  return `${heartbeatPrefix(runId)}${at}.json`;
}

function heartbeatPrefix(runId) {
  return `heartbeat-${runId}-`;
}
