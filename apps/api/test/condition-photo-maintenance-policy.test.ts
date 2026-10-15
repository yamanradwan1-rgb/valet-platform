import { describe, expect, it } from "vitest";

import { readConditionPhotoMaintenancePolicy } from "../src/modules/vehicle-photos/condition-photo-maintenance-policy";

describe("#215 P5 deletion release gate", () => {
  it("defaults to a stopped worker and no-delete even with no provider", () => {
    expect(readConditionPhotoMaintenancePolicy({})).toEqual({
      enabled: false, batchSize: 100, sweepPeriodMs: 300_000,
      deleteAbandonedObjects: false,
    });
  });

  it("allows bounded expiry worker without granting deletion", () => {
    expect(readConditionPhotoMaintenancePolicy({
      CONDITION_PHOTO_MAINTENANCE_ENABLED: "true",
      CONDITION_PHOTO_MAINTENANCE_BATCH_SIZE: "1",
      CONDITION_PHOTO_MAINTENANCE_DELETE_ENABLED: "false",
    })).toMatchObject({
      enabled: true, batchSize: 1, deleteAbandonedObjects: false,
    });
  });

  it("rejects deletion requests and malformed workload caps", () => {
    for (const env of [
      { CONDITION_PHOTO_MAINTENANCE_DELETE_ENABLED: "true" },
      { CONDITION_PHOTO_MAINTENANCE_DELETE_ENABLED: "1" },
      { CONDITION_PHOTO_MAINTENANCE_ENABLED: "yes" },
      { CONDITION_PHOTO_MAINTENANCE_BATCH_SIZE: "0" },
      { CONDITION_PHOTO_MAINTENANCE_BATCH_SIZE: "101" },
      { CONDITION_PHOTO_MAINTENANCE_BATCH_SIZE: "1.5" },
    ]) expect(() => readConditionPhotoMaintenancePolicy(env)).toThrow();
  });
});
