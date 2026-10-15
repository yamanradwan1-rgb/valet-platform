import "reflect-metadata";

import { setTimeout as delay } from "node:timers/promises";

import {
  createRuntimePostgresPool,
  verifyProductionRuntimeDatabaseSafety,
} from "./common/database/postgres";
import { PostgresConditionPhotoIntegrityJournal } from "./modules/vehicle-photos/condition-photo-maintenance-integrity-journal";
import { inspectConditionPhotoIntegrity } from "./modules/vehicle-photos/condition-photo-maintenance-integrity";
import {
  PostgresConditionPhotoMaintenanceJournal,
  verifyConditionPhotoMaintenanceDatabaseIdentity,
} from "./modules/vehicle-photos/condition-photo-maintenance-journal";
import { readConditionPhotoMaintenancePolicy } from "./modules/vehicle-photos/condition-photo-maintenance-policy";
import { sweepConditionPhotoMaintenance } from "./modules/vehicle-photos/condition-photo-maintenance-sweep";
import type { PhotoMaintenanceStorage } from "./modules/vehicle-photos/condition-photo-maintenance-types";
import { resolveConditionPhotoStorageConfig } from "./modules/vehicle-photos/condition-photo-storage-config";
import { S3PrivatePhotoStore } from "./modules/vehicle-photos/s3-private-photo-store";

// This process has no delete-capable S3 client or delete command invocation.
const noDeletionStorage: PhotoMaintenanceStorage = {
  async listExactVersions() { throw new Error("P5 object deletion disabled."); },
  async deleteExactVersion() { throw new Error("P5 object deletion disabled."); },
};

async function bootstrap(): Promise<void> {
  const policy = readConditionPhotoMaintenancePolicy(process.env);
  if (!policy.enabled) return;
  const role = process.env.CONDITION_PHOTO_MAINTENANCE_ROLE ?? "";
  const databaseUrl = process.env.CONDITION_PHOTO_MAINTENANCE_DATABASE_URL;
  if (!databaseUrl) throw new Error("P5 dedicated database credentials missing.");
  const integrityEnabled = process.env.CONDITION_PHOTO_MAINTENANCE_INTEGRITY_ENABLED;
  if (integrityEnabled !== undefined && !["true", "false"].includes(integrityEnabled))
    throw new Error("P5 integrity mode invalid.");
  const config = integrityEnabled === "true"
    ? resolveConditionPhotoStorageConfig(process.env)
    : undefined;
  if (integrityEnabled === "true" && !config)
    throw new Error("P5 integrity needs approved private storage configuration.");

  const pool = createRuntimePostgresPool(databaseUrl, process.env);
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  try {
    if (process.env.NODE_ENV === "production")
      await verifyProductionRuntimeDatabaseSafety(pool);
    await verifyConditionPhotoMaintenanceDatabaseIdentity(pool, role);
    const journal = new PostgresConditionPhotoMaintenanceJournal(
      pool, config?.bucketAlias ?? "maintenance_no_delete",
    );
    const integrityJournal = new PostgresConditionPhotoIntegrityJournal(pool);
    const integrityStore = config ? new S3PrivatePhotoStore(config) : undefined;
    while (!stop.signal.aborted) {
      try {
        const expiry = await sweepConditionPhotoMaintenance(
          journal, noDeletionStorage, { batchSize: policy.batchSize },
        );
        const integrity = integrityStore && config
          ? await inspectConditionPhotoIntegrity(
              integrityJournal, integrityStore, config.bucketAlias,
              { batchSize: policy.batchSize, strongVersionedReadProved: false },
            )
          : undefined;
        // Numeric-only observability: never log keys, hashes, tenant or staff.
        process.stdout.write(`${JSON.stringify({
          event: "P5_MAINTENANCE", expiry,
          ...(integrity ? { integrity } : {}),
          deletionEnabled: false,
        })}\n`);
      } catch {
        process.stderr.write("P5 maintenance cycle failed; no storage deletion attempted.\n");
      }
      try {
        await delay(policy.sweepPeriodMs, undefined, { signal: stop.signal });
      } catch (error) {
        if (!stop.signal.aborted) throw error;
      }
    }
  } finally {
    await pool.end();
  }
}

void bootstrap().catch(() => {
  process.stderr.write("P5 maintenance startup or shutdown failed.\n");
  process.exitCode = 1;
});
