import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// Persistent cluster-scoped stop sign. An interrupted test may leave a writer
// alive even when the Vitest coordinator is dead. A different Vitest project
// must not interpret its stale ownership record as permission to FORCE DROP.
const NAME = "issue442-u003-resource-quarantine.json";
const markerPath = (clusterDir) => join(clusterDir, NAME);

function readMarker(clusterDir) {
  const file = markerPath(clusterDir);
  if (!existsSync(file)) return undefined;
  // Corrupt or partially written markers deliberately fail closed.
  const marker = JSON.parse(readFileSync(file, "utf8"));
  if (
    marker?.version !== 1 ||
    typeof marker.runId !== "string" ||
    typeof marker.nonce !== "string" ||
    !["PENDING", "LOCAL_COMPLETE"].includes(marker.state)
  ) {
    throw new Error("U003_RESOURCE_QUARANTINE_UNREADABLE_OR_INVALID");
  }
  return marker;
}

export function assertClusterRecoveryPermitted(clusterDir) {
  if (readMarker(clusterDir)) {
    throw new Error(
      "U003_RESOURCE_QUARANTINE: refuse cluster lease takeover and stale-owner recovery",
    );
  }
}

export function assertRunCleanupPermitted(clusterDir, runId) {
  const marker = readMarker(clusterDir);
  if (marker && (marker.runId !== runId || marker.state !== "LOCAL_COMPLETE")) {
    throw new Error(
      "U003_UNSETTLED_WRITER: refuse child retirement and DROP DATABASE WITH FORCE",
    );
  }
}

export function reserveResourceQuarantine(clusterDir, runId, nonce) {
  if (!runId || !nonce) throw new Error("U003_RESOURCE_OWNER_REQUIRED");
  const fd = openSync(markerPath(clusterDir), "wx", 0o600);
  try {
    writeFileSync(
      fd,
      JSON.stringify({ version: 1, runId, nonce, state: "PENDING" }),
    );
  } finally {
    closeSync(fd);
  }
}

export function completeResourceQuarantine(clusterDir, runId, nonce) {
  const marker = readMarker(clusterDir);
  if (
    !marker ||
    marker.runId !== runId ||
    marker.nonce !== nonce ||
    marker.state !== "PENDING"
  ) {
    throw new Error("U003_RESOURCE_QUARANTINE_OWNER_MISMATCH");
  }
  writeFileSync(
    markerPath(clusterDir),
    JSON.stringify({
      ...marker,
      state: "LOCAL_COMPLETE",
    }),
  );
}

export function releaseResourceQuarantine(clusterDir, runId, nonce) {
  const marker = readMarker(clusterDir);
  if (
    !marker ||
    marker.runId !== runId ||
    marker.nonce !== nonce ||
    marker.state !== "LOCAL_COMPLETE"
  ) {
    throw new Error("U003_RESOURCE_QUARANTINE_RELEASE_NOT_ATTESTED");
  }
  unlinkSync(markerPath(clusterDir));
}
