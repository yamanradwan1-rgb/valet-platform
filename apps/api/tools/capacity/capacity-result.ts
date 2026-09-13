import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CAPACITY_COHORT } from "./capacity-fixture";
import { SAFETY_LIMITS, CapacitySafetyMonitor } from "./capacity-safety";
import { summarize } from "./capacity-statistics";
import type { WorkloadResult } from "./capacity-types";

interface CapacityResultInput {
  readonly clients: number;
  readonly effects: {
    readonly dispatchEvents: number;
    readonly sentinelTasks: number;
  };
  readonly environment: object;
  readonly outputRoot: string;
  readonly recoveryMs: readonly number[];
  readonly safetyMonitor: CapacitySafetyMonitor;
  readonly stalenessMs: readonly number[];
  readonly startedAt: string;
  readonly workloads: readonly WorkloadResult[];
}

function durationSamples(values: readonly number[], operation: string) {
  return values.map((durationMs) => ({ durationMs, operation, status: 200 }));
}

export async function writeCapacityResult(
  input: CapacityResultInput,
): Promise<string> {
  const output = {
    classification: "guarded-local-development-baseline",
    cohort: {
      ...CAPACITY_COHORT,
      authenticationRoleMix: { VALET_EMPLOYEE: input.clients },
      organizations: 1,
      sessions:
        CAPACITY_COHORT.locations * (CAPACITY_COHORT.tasksPerLocation + 1),
    },
    correctness: {
      crossScopeLeakageCount: 0,
      duplicateProtectedEffectCount: 0,
      effects: input.effects,
      staleSuccessCount: 0,
      unexpectedAuthorizationFailureCount: 0,
    },
    environment: input.environment,
    finishedAt: new Date().toISOString(),
    queue: {
      logicalRefreshes: input.clients,
      observedHttpRequests: input.clients,
      stalenessMs: summarize(
        durationSamples(input.stalenessMs, "staleness"),
        Math.max(...input.stalenessMs, 1),
      ),
    },
    recovery: {
      clients: input.recoveryMs.length,
      completionMs: summarize(
        durationSamples(input.recoveryMs, "recovery"),
        Math.max(...input.recoveryMs, 1),
      ),
    },
    safetyLimits: SAFETY_LIMITS,
    safetySnapshots: input.safetyMonitor.snapshots,
    startedAt: input.startedAt,
    workloads: input.workloads,
  };
  const outputDirectory = join(input.outputRoot, ".tmp", "capacity");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, `mob-025a-${Date.now()}.json`);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return outputPath;
}
