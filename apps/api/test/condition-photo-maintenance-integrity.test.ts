import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrivatePhotoStore } from "../src/modules/vehicle-photos/private-photo-store";
import { ConditionPhotoStorageError } from "../src/modules/vehicle-photos/private-photo-store";
import {
  inspectConditionPhotoIntegrity,
  type PhotoIntegrityJournal,
} from "../src/modules/vehicle-photos/condition-photo-maintenance-integrity";
import { verifyStoredConditionJpeg } from "../src/modules/vehicle-photos/condition-photo-jpeg-decoder";

vi.mock("../src/modules/vehicle-photos/condition-photo-jpeg-decoder", () => ({
  ConditionPhotoDecodeError: class extends Error {
    constructor(readonly code: string) { super(code); }
  },
  verifyStoredConditionJpeg: vi.fn(),
}));

const key = "condition-photo/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
const photoId = "44444444-4444-4444-8444-444444444444";
const bytes = Buffer.from("private canonical bytes");
const sha256 = createHash("sha256").update(bytes).digest();
const candidate = {
  photoId, objectKey: key, version: "exact-version",
  byteSize: bytes.length, sha256, width: 5, height: 5,
  bucketAlias: "private_fixture", availability: "AVAILABLE" as const,
};

function fixture(error?: unknown) {
  const marked = vi.fn(async () => true);
  const journal: PhotoIntegrityJournal = {
    availableCandidates: async () => [candidate],
    markUnavailable: marked,
  };
  const returned = Buffer.from(bytes);
  const store = {
    readExact: vi.fn(async () => {
      if (error) throw error;
      return { bytes: returned, version: candidate.version };
    }),
  } as unknown as Pick<PrivatePhotoStore, "readExact">;
  return { journal, store, marked, returned };
}

describe("#215 verified-photo integrity maintenance", () => {
  beforeEach(() => {
    vi.mocked(verifyStoredConditionJpeg).mockReset();
    vi.mocked(verifyStoredConditionJpeg).mockResolvedValue({
      canonicalSha256: sha256,
      byteSize: bytes.length, width: 5, height: 5,
    });
  });

  it("does not mutate coherent available bytes and zeroes the buffer", async () => {
    const f = fixture();
    const result = await inspectConditionPhotoIntegrity(f.journal, f.store, "private_fixture");
    expect(result).toEqual({ checked: 1, changed: 0, unavailable: 0, unknown: 0, rejected: 0 });
    expect(f.marked).not.toHaveBeenCalled();
    expect(f.returned.equals(Buffer.alloc(bytes.length))).toBe(true);
  });

  it("marks digest mismatch unavailable through the narrow audited DB writer", async () => {
    const f = fixture();
    vi.mocked(verifyStoredConditionJpeg).mockResolvedValueOnce({
      canonicalSha256: Buffer.alloc(32, 99), byteSize: bytes.length,
      width: 5, height: 5,
    });
    const result = await inspectConditionPhotoIntegrity(f.journal, f.store, "private_fixture");
    expect(result.changed).toBe(1);
    expect(f.marked).toHaveBeenCalledWith(photoId, "CONTENT_MISMATCH");
  });

  it("treats missing exact version as unknown until provider read consistency is qualified", async () => {
    const f = fixture(new ConditionPhotoStorageError("NOT_FOUND"));
    const unqualified = await inspectConditionPhotoIntegrity(f.journal, f.store, "private_fixture");
    expect(unqualified.unknown).toBe(1);
    expect(f.marked).not.toHaveBeenCalled();
    const qualified = await inspectConditionPhotoIntegrity(f.journal, f.store,
      "private_fixture", { strongVersionedReadProved: true });
    expect(qualified.changed).toBe(1);
    expect(f.marked).toHaveBeenCalledWith(photoId, "MISSING_OBJECT");
  });

  it("preserves AVAILABLE on timeout, credential failures and foreign bucket", async () => {
    const f = fixture(new ConditionPhotoStorageError("UNKNOWN"));
    const result = await inspectConditionPhotoIntegrity(f.journal, f.store,
      "private_fixture", { strongVersionedReadProved: true });
    expect(result.unknown).toBe(1);
    expect(f.marked).not.toHaveBeenCalled();
    const foreign = await inspectConditionPhotoIntegrity(f.journal, f.store, "foreign_bucket");
    expect(foreign.rejected).toBe(1);
    expect(f.store.readExact).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown database acknowledgement without claiming success", async () => {
    const f = fixture();
    const journal = { ...f.journal, markUnavailable: async () => {
      throw new Error("database unavailable after commit");
    } };
    vi.mocked(verifyStoredConditionJpeg).mockResolvedValueOnce({
      canonicalSha256: Buffer.alloc(32), byteSize: bytes.length,
      width: 5, height: 5,
    });
    const result = await inspectConditionPhotoIntegrity(journal, f.store, "private_fixture");
    expect(result.changed).toBe(0);
    expect(result.unknown).toBe(1);
  });
});
