import { mkdir, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { preflightSanitizedChild } from "./target-preflight.mjs";

// No generic lease/recovery path is used by the private Issue416 PG17 project.
// Stale private leases are never cleared automatically.
const leasePath = join(tmpdir(), "vaylet-issue416-w9-pg17-exclusive-lease");

export default async function setup() {
  await preflightSanitizedChild(); // BEFORE any lease, setup or DDL.
  try {
    await mkdir(leasePath);
  } catch {
    throw new Error("Issue416 PG17 private lease exists; check owner manually.");
  }
  try {
    await preflightSanitizedChild(); // Recheck after acquiring exclusive lease.
  } catch (error) {
    await rmdir(leasePath);
    throw error;
  }
  return async () => {
    await rmdir(leasePath); // Only remove this run's empty lease directory.
  };
}
