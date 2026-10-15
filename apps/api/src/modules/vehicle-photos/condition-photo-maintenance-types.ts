/** The database, not the application clock, decides which rows are due. */
export interface AbandonedPhotoClaim {
  readonly attemptId: string;
  readonly operationId: string;
  /** Unique fenced claim from a maintenance-only database function. */
  readonly claimId: string;
  readonly bucketAlias: string;
  readonly objectKey: string;
  /** All immutable versions of this exact abandoned key may be discovered. */
  readonly status: "ABANDONED";
  readonly selected: false;
  readonly verified: false;
  readonly held: false;
  /** Includes legacy metadata-only rows with this exact object key. */
  readonly legacyReferenced: false;
}

export interface PhotoMaintenanceJournal {
  /** Bounded discovery under DB time; a completed sweep does not erase tombstones. */
  expiredOperationIds(limit: number): Promise<readonly string[]>;
  expireOperation(operationId: string): Promise<boolean>;
  abandonedAttemptIds(limit: number): Promise<readonly string[]>;
  /** Atomic scoped DB claim excludes any photo key reference, held/incident
   * scope, SELECTED, verification and live leases. */
  claimAbandonedAttempt(attemptId: string): Promise<AbandonedPhotoClaim | undefined>;
  /** Must be fenced by claimId. A failed/unknown outcome is retryable. */
  recordCleanupCheck(claim: AbandonedPhotoClaim): Promise<boolean>;
}

export interface AbandonedVersion {
  readonly key: string;
  readonly version: string;
}

/** An isolated cleanup principal, never the uploading API's S3 identity. */
export interface PhotoMaintenanceStorage {
  listExactVersions(key: string, deadlineAtMs: number): Promise<readonly AbandonedVersion[]>;
  deleteExactVersion(version: AbandonedVersion, deadlineAtMs: number): Promise<void>;
}

export interface PhotoMaintenanceMetrics {
  readonly expired: number;
  readonly claimDenied: number;
  readonly cleanupChecked: number;
  readonly exactVersionsDeleted: number;
  readonly unsafeClaim: number;
  readonly storageUnknown: number;
  readonly dbUnknown: number;
}
