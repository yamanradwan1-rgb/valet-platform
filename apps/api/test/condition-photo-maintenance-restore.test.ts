import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  checkPairedPhotoRestore,
  type RestoredPhotoReference,
} from "../src/modules/vehicle-photos/condition-photo-maintenance-restore";

const operationId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const bytes = Buffer.from("restored evidence version 1");
const record: RestoredPhotoReference = {
  operationId, attemptId, photoId: "44444444-4444-4444-8444-444444444444",
  key: `condition-photo/${operationId}/${attemptId}`,
  version: "immutable-v1", byteSize: bytes.length,
  contentSha256: createHash("sha256").update(bytes).digest(),
};

describe("#215 paired DB/private-object restore fixture", () => {
  it("checks the exact immutable version against independently restored DB digest", async () => {
    const returned = Buffer.from(bytes);
    expect(await checkPairedPhotoRestore(record, {
      readExact: async () => ({ bytes: returned, version: "immutable-v1" }),
    })).toBe("MATCH");
    expect(returned.equals(Buffer.alloc(bytes.length))).toBe(true);
  });

  it("rejects wrong key, version, digest or size without altering history", async () => {
    const restored = { readExact: async () => ({
      bytes: Buffer.from(bytes), version: "immutable-v1",
    }) };
    for (const change of [
      { key: `condition-photo/${attemptId}/${operationId}` },
      { version: "wrong-v2" },
      { byteSize: bytes.length + 1 },
      { contentSha256: Buffer.alloc(32) },
    ]) {
      expect(await checkPairedPhotoRestore({ ...record, ...change }, restored))
        .toBe("MISMATCH");
    }
  });

  it("reports provider/backup outage as UNKNOWN, never as matching evidence", async () => {
    expect(await checkPairedPhotoRestore(record, {
      readExact: async () => { throw new Error("isolated restore storage unavailable"); },
    })).toBe("UNKNOWN");
  });
});
