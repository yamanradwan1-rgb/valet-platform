import console from "node:console";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assertRaceRuntimeAuthorized,
  raceReadiness,
} from "./race-readiness.mjs";
import {
  assertRaceMatrix,
  defineTrial,
  enumerateTrials,
} from "./race-matrix.mjs";

// Deliberately no import from pg, test-fixture, Docker, Prisma or migration.
// The unfulfilled W9 independent lease ownership gate blocks even a valid
// looking adapter or a user-supplied URL/flag before a single callback runs.
export async function executePg17RaceTrial({
  id,
  direction,
  outcome,
  adapter,
} = {}) {
  assertRaceRuntimeAuthorized();
  // A future separately authorized revision must first certify the real
  // issuer, test-only barrier, C/R/D/U/T fault driver and owner-scoped lease.
  // In the current source revision, control cannot reach the adapter.
  void adapter;
  return defineTrial(id, direction, outcome);
}

export function sourceOnlyRacePlan() {
  assertRaceMatrix();
  return Object.freeze({
    status: raceReadiness().status,
    executed: 0,
    pg17Passed: 0,
    pg17Failed: 0,
    trials: enumerateTrials(),
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()
) {
  const mode = process.argv[2];
  if (mode === "--source-plan" && process.argv.length === 3) {
    const plan = sourceOnlyRacePlan();
    console.log(
      `${plan.status}; ${plan.trials.length} declared; 0 PG17 executed`,
    );
  } else {
    assertRaceRuntimeAuthorized();
  }
}
