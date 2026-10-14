import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clusterKey } from "./ownership-state.mjs";
import { stopLeaseHeartbeat } from "./lease-heartbeat.mjs";

export function parkClusterLeaseForRecovery({
  databaseUrl, runId,
  stateRoot = join(tmpdir(), "vaylet-postgres-test-harness"),
}) {
  const clusterDir = join(stateRoot, clusterKey(databaseUrl));
  const owner = JSON.parse(readFileSync(join(clusterDir, "owner.json"), "utf8"));
  if (owner?.runId !== runId) {
    throw new Error("Cannot park PostgreSQL test lease owned by another run.");
  }
  // Preserve owner.json and all transitive recoveryRunIds. The next verified
  // run can reclaim once the owner has exited or the normal lease grace period
  // has elapsed; do not erase recovery evidence merely to allow a fast retry.
  stopLeaseHeartbeat(clusterDir, runId);
}
