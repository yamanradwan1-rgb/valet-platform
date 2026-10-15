import type {
  AbandonedPhotoClaim,
  PhotoMaintenanceJournal,
  PhotoMaintenanceMetrics,
  PhotoMaintenanceStorage,
} from "./condition-photo-maintenance-types";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uuidPattern = new RegExp(`^${uuid}$`, "i");
const keyPattern = new RegExp(`^condition-photo/(${uuid})/(${uuid})$`, "i");

export interface MaintenanceSweepOptions {
  readonly batchSize?: number;
  /** Remains false until DB claims, IAM, restore and provider proof are reviewed. */
  readonly enableAbandonedDeletion?: boolean;
  readonly approvedBucketAlias?: string;
  readonly pairedRestoreProved?: boolean;
  readonly providerVersionListingQualified?: boolean;
}

export function safeAbandonedClaim(
  claim: AbandonedPhotoClaim,
  approvedBucketAlias: string,
): boolean {
  const match = keyPattern.exec(claim.objectKey);
  return claim.status === "ABANDONED" && claim.selected === false &&
    claim.verified === false && claim.held === false &&
    claim.legacyReferenced === false &&
    uuidPattern.test(claim.claimId) && uuidPattern.test(claim.attemptId) &&
    uuidPattern.test(claim.operationId) &&
    match?.[1]?.toLowerCase() === claim.operationId.toLowerCase() &&
    match?.[2]?.toLowerCase() === claim.attemptId.toLowerCase() &&
    claim.bucketAlias === approvedBucketAlias;
}

/** A single invocation is bounded. Re-run tombstones indefinitely for late PUTs. */
export async function sweepConditionPhotoMaintenance(
  journal: PhotoMaintenanceJournal,
  storage: PhotoMaintenanceStorage,
  options: MaintenanceSweepOptions = {},
): Promise<PhotoMaintenanceMetrics> {
  const limit = options.batchSize ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Condition photo maintenance batch size is invalid.");

  const count = {
    expired: 0, claimDenied: 0, cleanupChecked: 0,
    exactVersionsDeleted: 0, unsafeClaim: 0, storageUnknown: 0, dbUnknown: 0,
  };
  // Operations and attempts come only from the maintenance DB's bounded discovery.
  const operations = await journal.expiredOperationIds(limit);
  if (operations.length > limit) throw new Error("Unbounded expiry discovery.");
  for (const id of operations) {
    if (!uuidPattern.test(id)) { count.dbUnknown++; continue; }
    try {
      if (await journal.expireOperation(id)) count.expired++;
    } catch { count.dbUnknown++; }
  }

  if (!options.enableAbandonedDeletion) return count;
  if (!options.pairedRestoreProved || !options.providerVersionListingQualified)
    throw new Error("Condition photo cleanup provider and restore gates are incomplete.");
  const alias = options.approvedBucketAlias;
  if (!alias || !/^[a-z][a-z0-9_-]{0,59}$/.test(alias))
    throw new Error("Condition photo cleanup requires an approved bucket identity.");

  const attempts = await journal.abandonedAttemptIds(limit);
  if (attempts.length > limit) throw new Error("Unbounded abandoned discovery.");
  for (const id of attempts) {
    if (!uuidPattern.test(id)) { count.unsafeClaim++; continue; }
    let claim: AbandonedPhotoClaim | undefined;
    try { claim = await journal.claimAbandonedAttempt(id); }
    catch { count.dbUnknown++; continue; }
    if (!claim) { count.claimDenied++; continue; }
    if (claim.attemptId !== id || !safeAbandonedClaim(claim, alias)) {
      count.unsafeClaim++;
      continue;
    }
    try {
      // The accepted 60s upload envelope is also the upper bound on external
      // cleanup work while the future DB claim's 120s lease is live.
      const deadlineAtMs = Date.now() + 60_000;
      const versions = await storage.listExactVersions(claim.objectKey, deadlineAtMs);
      if (versions.length > 20 || versions.some(
        (version) => version.key !== claim.objectKey ||
          !version.version || version.version.length > 240,
      )) {
        count.storageUnknown++;
        continue;
      }
      // Each version is deleted explicitly. Never issue an unversioned DELETE
      // which merely creates a delete marker or obscures surviving bytes.
      for (const version of versions) {
        if (Date.now() >= deadlineAtMs) throw new Error("Cleanup claim deadline expired.");
        await storage.deleteExactVersion(version, deadlineAtMs);
        count.exactVersionsDeleted++;
      }
    } catch {
      // No absence or success is inferred from provider timeouts/unknown writes.
      count.storageUnknown++;
      continue;
    }
    try {
      if (await journal.recordCleanupCheck(claim)) count.cleanupChecked++;
      else count.dbUnknown++;
    } catch { count.dbUnknown++; }
  }
  return count;
}
