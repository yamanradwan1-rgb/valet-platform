import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const control = vi.hoisted(() => ({
  reserve: vi.fn(),
  mark: vi.fn(),
  finalize: vi.fn(),
  failure: vi.fn(),
}));
vi.mock("../src/modules/vehicle-photos/condition-photo-transactions", () => ({
  reserveConditionPhoto: control.reserve,
  markConditionPhotoStored: control.mark,
  finalizeConditionPhoto: control.finalize,
  recordConditionPhotoFailure: control.failure,
}));
vi.mock("../src/common/database/postgres-transaction", () => ({
  inPostgresTransaction: async (
    _pool: unknown,
    action: (tx: object) => Promise<unknown>,
  ) => await action({}),
}));
vi.mock("../src/modules/vehicle-photos/condition-photo-authorization", () => ({
  authorizeConditionPhotoScope: async () => ({}),
}));
vi.mock("../src/modules/vehicle-photos/condition-photo-status-query", () => ({
  readConditionPhotoStatus: async () => ({ status: "VERIFIED" }),
}));

import { executeConditionPhotoUpload } from "../src/modules/vehicle-photos/condition-photo-upload-executor";
import {
  ConditionPhotoStorageError,
  type PrivatePhotoStore,
} from "../src/modules/vehicle-photos/private-photo-store";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";

const pool = {} as PostgresPool;
const credential = {} as StaffSessionContext;
beforeEach(() => {
  vi.resetAllMocks();
  control.reserve.mockResolvedValue({
    lease: { object_key: "synthetic-key" },
    replayVerified: false,
  });
});

async function execute(signal: AbortSignal, onPut: () => void = () => {}) {
  let stored: Buffer;
  const store = {
    putIfAbsent: vi.fn(async (_key: string, bytes: Buffer) => {
      stored = Buffer.from(bytes);
      onPut();
      return { version: "synthetic-version" };
    }),
    readExact: vi.fn(async () => ({
      bytes: Buffer.from(stored),
      version: "synthetic-version",
    })),
  };
  const bytes = await sharp({
    create: { width: 16, height: 12, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  return {
    store,
    run: () =>
      executeConditionPhotoUpload(
        pool,
        store as unknown as PrivatePhotoStore,
        "fixture",
        credential,
        "session",
        "operation",
        bytes,
        signal,
      ),
  };
}

describe("cancellation stops only pre-reservation work", () => {
  it("never reserves or writes storage for a disconnected pre-reservation request", async () => {
    const cancellation = new AbortController();
    cancellation.abort();
    const task = await execute(cancellation.signal);
    await expect(task.run()).rejects.toMatchObject({
      code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE",
    });
    expect(control.reserve).not.toHaveBeenCalled();
    expect(task.store.putIfAbsent).not.toHaveBeenCalled();
  });

  it("finishes and journals an in-flight stored operation after disconnect without retry", async () => {
    const cancellation = new AbortController();
    const task = await execute(cancellation.signal, () => cancellation.abort());
    expect(await task.run()).toMatchObject({
      status: { status: "VERIFIED" },
      newCommit: true,
    });
    expect(control.reserve).toHaveBeenCalledOnce();
    expect(task.store.putIfAbsent).toHaveBeenCalledOnce();
    expect(control.mark).toHaveBeenCalledOnce();
    expect(control.finalize).toHaveBeenCalledOnce();
    expect(control.failure).not.toHaveBeenCalled();
  });

  it("records an unknown outcome if finalization fails after a disconnect; never retries it", async () => {
    const cancellation = new AbortController();
    const task = await execute(cancellation.signal, () => cancellation.abort());
    control.finalize.mockRejectedValueOnce(
      new Error("controlled transaction failure"),
    );
    await expect(task.run()).rejects.toThrow("controlled transaction failure");
    expect(control.finalize).toHaveBeenCalledOnce();
    expect(control.failure).toHaveBeenCalledOnce();
    expect(task.store.putIfAbsent).toHaveBeenCalledOnce();
  });

  it("journals an ambiguous PUT and performs no blind PUT retry", async () => {
    const cancellation = new AbortController();
    const task = await execute(cancellation.signal);
    task.store.putIfAbsent.mockRejectedValueOnce(
      new ConditionPhotoStorageError("UNKNOWN"),
    );
    await expect(task.run()).rejects.toMatchObject({
      code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE",
    });
    expect(task.store.putIfAbsent).toHaveBeenCalledOnce();
    expect(task.store.readExact).not.toHaveBeenCalled();
    expect(control.finalize).not.toHaveBeenCalled();
    expect(control.failure.mock.calls[0]?.at(-1)).toBe(
      "STORAGE_OUTCOME_UNKNOWN",
    );
  });
  it("a timeout/disconnect signal at finalization does not cancel or retry its mutation", async () => {
    const cancellation = new AbortController();
    const task = await execute(cancellation.signal);
    control.finalize.mockImplementationOnce(async () => {
      cancellation.abort();
      return "photo";
    });
    expect(await task.run()).toMatchObject({ status: { status: "VERIFIED" } });
    expect(control.finalize).toHaveBeenCalledOnce();
    expect(task.store.putIfAbsent).toHaveBeenCalledOnce();
  });

  it.each(["missing", "different"])(
    "does not finalize a %s exact read-back",
    async (mode) => {
      const task = await execute(new AbortController().signal);
      if (mode === "missing")
        task.store.readExact.mockRejectedValueOnce(
          new ConditionPhotoStorageError("UNAVAILABLE"),
        );
      else
        task.store.readExact.mockResolvedValueOnce({
          bytes: Buffer.from("different"),
          version: "synthetic-version",
        });
      await expect(task.run()).rejects.toMatchObject({
        code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE",
      });
      expect(control.mark).not.toHaveBeenCalled();
      expect(control.finalize).not.toHaveBeenCalled();
      expect(control.failure).toHaveBeenCalledOnce();
      expect(task.store.putIfAbsent).toHaveBeenCalledOnce();
    },
  );
});
