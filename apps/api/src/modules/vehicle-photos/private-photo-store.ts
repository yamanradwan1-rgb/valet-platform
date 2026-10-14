export interface PrivatePhotoObject {
  /** Must be an opaque attempt key issued and persisted by P1 PostgreSQL. */
  readonly key: string;
  readonly version: string | null;
}

export interface StoredPhotoRead {
  readonly bytes: Buffer;
  readonly version: string | null;
}

/** No signed/public URL, arbitrary key lookup, or generic client fetch. */
export interface PrivatePhotoStore {
  putIfAbsent(key: string, bytes: Buffer, deadlineMs?: number): Promise<PrivatePhotoObject>;
  readExact(object: PrivatePhotoObject, deadlineMs?: number): Promise<StoredPhotoRead>;
  statExact(object: PrivatePhotoObject, deadlineMs?: number): Promise<{
    readonly exists: boolean;
    readonly size?: number;
    readonly version?: string | null;
  }>;
  /** P5 alone may use separately authorized, tombstone-fenced cleanup. */
  deleteAbandonedExact(object: PrivatePhotoObject): Promise<never>;
}

export class ConditionPhotoStorageError extends Error {
  constructor(readonly reason: "UNAVAILABLE" | "TIMEOUT" | "UNKNOWN" | "NOT_FOUND" | "CONFLICT") {
    super("Private photo storage is unavailable.");
  }
}
