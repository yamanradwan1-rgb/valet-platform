import {
  assertOriginalW9RecoveryTarget,
  W9_ORIGINAL_RECOVERY_TARGET,
} from "./resolve-113-guard.mjs";

// Pure contract checked by the --import pre-entrypoint, before Prisma CLI
// executes. This is not a general W9 migration/fixture admission helper.
export function assertRecoveryChildTarget(identity, env = process.env) {
  const serverStarted = env.ISSUE416_W9_RECOVERY_SERVER_STARTED;
  if (typeof serverStarted !== "string" ||
      !Number.isFinite(Date.parse(serverStarted))) {
    throw new Error("Issue416 recovery child lacks a pinned server epoch.");
  }
  assertOriginalW9RecoveryTarget(identity, {
    ...W9_ORIGINAL_RECOVERY_TARGET, serverStarted,
  });
}
