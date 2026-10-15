export interface ConditionPhotoMaintenancePolicy {
  readonly enabled: boolean;
  readonly batchSize: number;
  readonly sweepPeriodMs: 300_000;
  readonly deleteAbandonedObjects: false;
}

/** No environment variable, CLI flag or deployment switch authorizes deletion. */
export function readConditionPhotoMaintenancePolicy(
  env: NodeJS.ProcessEnv = process.env,
): ConditionPhotoMaintenancePolicy {
  const enabled = env.CONDITION_PHOTO_MAINTENANCE_ENABLED === "true";
  if (env.CONDITION_PHOTO_MAINTENANCE_ENABLED !== undefined &&
      !["true", "false"].includes(env.CONDITION_PHOTO_MAINTENANCE_ENABLED))
    throw new Error("Condition photo maintenance enablement is invalid.");
  if (env.CONDITION_PHOTO_MAINTENANCE_DELETE_ENABLED !== undefined &&
      env.CONDITION_PHOTO_MAINTENANCE_DELETE_ENABLED !== "false")
    throw new Error("Condition photo cleanup deletion is not approved.");
  const rawBatch = env.CONDITION_PHOTO_MAINTENANCE_BATCH_SIZE ?? "100";
  if (!/^(?:[1-9]|[1-9][0-9]|100)$/.test(rawBatch))
    throw new Error("Condition photo maintenance batch cap is invalid.");
  return {
    enabled,
    batchSize: Number(rawBatch),
    sweepPeriodMs: 300_000,
    deleteAbandonedObjects: false,
  };
}
