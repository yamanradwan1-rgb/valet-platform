import { describe, expect, it } from "vitest";

import {
  sweepConditionPhotoMaintenance,
  type MaintenanceSweepOptions,
} from "../src/modules/vehicle-photos/condition-photo-maintenance-sweep";
import type {
  AbandonedPhotoClaim,
  PhotoMaintenanceJournal,
  PhotoMaintenanceStorage,
} from "../src/modules/vehicle-photos/condition-photo-maintenance-types";

const operationId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const claimId = "33333333-3333-4333-8333-333333333333";
const key = `condition-photo/${operationId}/${attemptId}`;
const safe: AbandonedPhotoClaim = {
  attemptId, operationId, claimId, objectKey: key,
  bucketAlias: "private_fixture", status: "ABANDONED",
  selected: false, verified: false, held: false, legacyReferenced: false,
};
const active: MaintenanceSweepOptions = {
  enableAbandonedDeletion: true,
  approvedBucketAlias: "private_fixture",
  pairedRestoreProved: true,
  providerVersionListingQualified: true,
};

function fixture(candidate: AbandonedPhotoClaim = safe) {
  let claimed = false;
  let deleteCount = 0;
  let checks = 0;
  let unknownCommit = false;
  const objectVersions = new Set(["version-1"]);
  const journal: PhotoMaintenanceJournal = {
    expiredOperationIds: async () => [operationId],
    expireOperation: async () => true,
    abandonedAttemptIds: async () => [attemptId],
    claimAbandonedAttempt: async () => {
      if (claimed) return undefined;
      claimed = true;
      return candidate;
    },
    recordCleanupCheck: async () => {
      checks++;
      if (unknownCommit) throw new Error("lost database acknowledgement");
      return true;
    },
  };
  const storage: PhotoMaintenanceStorage = {
    listExactVersions: async () => [...objectVersions].map((version) => ({ key, version })),
    deleteExactVersion: async ({ version }) => {
      deleteCount++;
      objectVersions.delete(version);
    },
  };
  return {
    journal, storage, objectVersions,
    get counts() { return { checks, deleteCount }; },
    rearm() { claimed = false; },
    failDbCommit() { unknownCommit = true; },
    repairDb() { unknownCommit = false; },
  };
}

describe("#215 P5 fenced maintenance", () => {
  it("defaults to expiry only and never touches orphan objects", async () => {
    const f = fixture();
    const result = await sweepConditionPhotoMaintenance(f.journal, f.storage);
    expect(result.expired).toBe(1);
    expect(result.exactVersionsDeleted).toBe(0);
    expect(f.objectVersions.has("version-1")).toBe(true);
  });

  it("refuses backup mismatch or unqualified provider even with deletion enabled", async () => {
    const f = fixture();
    await expect(sweepConditionPhotoMaintenance(f.journal, f.storage, {
      ...active, pairedRestoreProved: false,
    })).rejects.toThrow(/restore gates/);
    await expect(sweepConditionPhotoMaintenance(f.journal, f.storage, {
      ...active, providerVersionListingQualified: false,
    })).rejects.toThrow(/provider and restore/);
    expect(f.counts.deleteCount).toBe(0);
  });

  it.each([
    { selected: true }, { verified: true }, { held: true },
    { legacyReferenced: true },
    { objectKey: "condition-photo/foreign/foreign" },
    { bucketAlias: "foreign_bucket" },
    { status: "SELECTED" },
  ])("rejects unsafe, selected, held, foreign claim %j", async (overrides) => {
    const f = fixture({ ...safe, ...overrides } as AbandonedPhotoClaim);
    const result = await sweepConditionPhotoMaintenance(f.journal, f.storage, active);
    expect(result.unsafeClaim).toBe(1);
    expect(f.counts.deleteCount).toBe(0);
  });

  it("two sweepers race for a DB fenced claim; at most one deletes", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([
      sweepConditionPhotoMaintenance(f.journal, f.storage, active),
      sweepConditionPhotoMaintenance(f.journal, f.storage, active),
    ]);
    expect(a.exactVersionsDeleted + b.exactVersionsDeleted).toBe(1);
    expect(a.claimDenied + b.claimDenied).toBe(1);
    expect(f.counts.checks).toBe(1);
  });

  it("preserves tombstones after a lost acknowledgement and revisits a late PUT", async () => {
    const f = fixture();
    f.failDbCommit();
    const first = await sweepConditionPhotoMaintenance(f.journal, f.storage, active);
    expect(first.dbUnknown).toBe(1);
    expect(first.exactVersionsDeleted).toBe(1);
    f.repairDb();
    f.rearm();
    f.objectVersions.add("late-version-2");
    const second = await sweepConditionPhotoMaintenance(f.journal, f.storage, active);
    expect(second.cleanupChecked).toBe(1);
    expect(second.exactVersionsDeleted).toBe(1);
    expect(f.objectVersions.size).toBe(0);
  });

  it("keeps the tombstone retryable after provider timeout or unexpected key", async () => {
    const f = fixture();
    let times = 0;
    const storage: PhotoMaintenanceStorage = {
      ...f.storage,
      listExactVersions: async () => {
        times++;
        if (times === 1) throw new Error("provider timeout");
        return [{ key: `${key}-sibling`, version: "version-1" }];
      },
    };
    expect((await sweepConditionPhotoMaintenance(f.journal, storage, active)).storageUnknown).toBe(1);
    f.rearm();
    expect((await sweepConditionPhotoMaintenance(f.journal, storage, active)).storageUnknown).toBe(1);
    expect(f.counts).toEqual({ checks: 0, deleteCount: 0 });
  });

  it("never overrides a live lease when the database refuses expiry", async () => {
    const f = fixture();
    const journal = { ...f.journal, expireOperation: async () => false };
    const result = await sweepConditionPhotoMaintenance(journal, f.storage);
    expect(result.expired).toBe(0);
  });
});
