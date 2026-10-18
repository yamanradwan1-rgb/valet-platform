import { describe, expect, it, vi } from "vitest";
import type { ConditionPhotoTransport } from "@valet/employee-client";
import { NativePinnedDiagnostics } from "../src/telemetry/native-pinned-diagnostics";
import { instrumentConditionPhotoUpload } from "../src/check-in/native-photo-upload-diagnostics";

const op = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";

function fixture(upload: ConditionPhotoTransport["upload"]) {
  const pinned = new NativePinnedDiagnostics();
  const capture = pinned.begin("photo");
  pinned.stage("photo", capture, "preview", "success");
  pinned.complete("photo", capture, "success", "not-attempted");
  const factory = (onDispatch: (signal: AbortSignal) => void): ConditionPhotoTransport => ({
    async upload(...args) { onDispatch(args[3]); return upload(...args); },
    discover: vi.fn(), status: vi.fn(), reconcile: vi.fn(),
  });
  return { pinned, observed: instrumentConditionPhotoUpload(factory, pinned, () => op) };
}

describe("photo upload diagnostics", () => {
  it("rejects missing Android Crypto before any upload attempt", () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const upload = vi.fn();
      const pinned = new NativePinnedDiagnostics();
      const observed = instrumentConditionPhotoUpload({
        upload, discover: vi.fn(), status: vi.fn(), reconcile: vi.fn(),
      }, pinned);
      expect(observed.createOperationId).toThrow("CONDITION_PHOTO_RANDOM_UNAVAILABLE");
      expect(upload).not.toHaveBeenCalled();
      expect(pinned.snapshot().photo.lastCompleted).toMatchObject({
        status: "failed", firstFailedStage: "upload-uuid", transport: "not-attempted",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retains a successful local capture when upload UUID fails", () => {
    const f = fixture(vi.fn());
    const failed = instrumentConditionPhotoUpload(
      f.observed.transport, f.pinned, () => { throw Error("SECRET_FILE"); },
    );
    expect(failed.createOperationId).toThrow();
    expect(f.pinned.snapshot().photo.lastCompleted).toMatchObject({
      firstFailedStage: "upload-uuid",
      localCapture: "success",
      transport: "not-attempted",
    });
    expect(JSON.stringify(f.pinned.snapshot())).not.toContain("SECRET_FILE");
  });

  it("keeps upload attempt unknown on a failed HTTP response", async () => {
    const f = fixture(vi.fn().mockRejectedValue(Error("TOKEN")));
    expect(f.observed.createOperationId()).toBe(op);
    await expect(f.observed.transport.upload(
      session, op, "private", new AbortController().signal,
    )).rejects.toThrow();
    expect(f.pinned.snapshot().photo.lastCompleted).toMatchObject({
      firstFailedStage: "upload-transport",
      transport: "attempted-unknown",
      localCapture: "success",
    });
  });

  it("classifies a failed local multipart build before HTTP as not attempted", async () => {
    const pinned = new NativePinnedDiagnostics();
    const local = pinned.begin("photo");
    pinned.stage("photo", local, "preview", "success");
    pinned.complete("photo", local, "success", "not-attempted");
    const failed = instrumentConditionPhotoUpload(
      () => ({
        upload: vi.fn().mockRejectedValue(Error("private local file vanished")),
        discover: vi.fn(), status: vi.fn(), reconcile: vi.fn(),
      }), pinned, () => op,
    );
    failed.createOperationId();
    await expect(failed.transport.upload(
      session, op, "private-handle", new AbortController().signal,
    )).rejects.toThrow();
    expect(pinned.snapshot().photo.lastCompleted).toMatchObject({
      firstFailedStage: "upload-body",
      transport: "not-attempted",
      localCapture: "success",
    });
  });

  it("attributes invalid authenticated upload responses to response validation", async () => {
    const pinned = new NativePinnedDiagnostics();
    const previous = pinned.begin("photo");
    pinned.stage("photo", previous, "preview", "success");
    pinned.complete("photo", previous, "success", "not-attempted");
    const observed = instrumentConditionPhotoUpload(
      (onDispatch, onResponse) => ({
        upload: async (_session, _operation, _handle, signal) => {
          onDispatch(signal);
          onResponse(signal, "error");
          throw new Error("PRIVATE_SERVER_BODY");
        },
        discover: vi.fn(), status: vi.fn(), reconcile: vi.fn(),
      }), pinned, () => op,
    );
    observed.createOperationId();
    await expect(observed.transport.upload(
      session, op, "private-handle", new AbortController().signal,
    )).rejects.toThrow();
    expect(pinned.snapshot().photo.lastCompleted).toMatchObject({
      firstFailedStage: "upload-response",
      transport: "attempted-unknown",
      localCapture: "success",
    });
    expect(JSON.stringify(pinned.snapshot())).not.toContain("PRIVATE_SERVER_BODY");
  });

  it("ignores late results after a scope change", async () => {
    let resolve!: (value: unknown) => void;
    const f = fixture(vi.fn(() => new Promise((r) => { resolve = r; })) as never);
    f.observed.createOperationId();
    const inFlight = f.observed.transport.upload(
      session, op, "private", new AbortController().signal,
    );
    f.observed.cancel();
    resolve({ status: "VERIFIED" });
    await inFlight;
    expect(f.pinned.snapshot().photo.lastCompleted).toMatchObject({
      status: "success", localCapture: "success", transport: "not-attempted",
    });
  });

  it("does not attribute an old aborted HTTP response to a newer photo upload", async () => {
    const oldId = "11111111-1111-4111-8111-111111111111";
    const newId = "33333333-3333-4333-8333-333333333333";
    const pinned = new NativePinnedDiagnostics();
    let releaseOld!: () => void;
    let releaseNew!: () => void;
    const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
    const newGate = new Promise<void>((resolve) => { releaseNew = resolve; });
    const ids = [oldId, newId];
    const instrumented = instrumentConditionPhotoUpload(
      (onDispatch, onResponse) => ({
        async upload(_session, operationId, _handle, signal) {
          onDispatch(signal);
          if (operationId === oldId) {
            await oldGate;
            onResponse(signal, "error");
            throw Error("private response body");
          }
          await newGate;
          onResponse(signal, "success");
          return { status: "VERIFIED" } as never;
        },
        discover: vi.fn(), status: vi.fn(), reconcile: vi.fn(),
      }), pinned, () => ids.shift()!,
    );
    expect(instrumented.createOperationId()).toBe(oldId);
    const oldController = new AbortController();
    const old = instrumented.transport.upload(session, oldId, "owned", oldController.signal);
    oldController.abort();
    instrumented.cancel();
    expect(instrumented.createOperationId()).toBe(newId);
    const newController = new AbortController();
    const newer = instrumented.transport.upload(session, newId, "owned", newController.signal);
    releaseOld();
    await expect(old).rejects.toThrow();
    expect(pinned.snapshot().photo.lastCompleted).toBeNull();
    releaseNew();
    await newer;
    expect(pinned.snapshot().photo.lastCompleted).toMatchObject({
      status: "success", firstFailedStage: null, transport: "verified",
    });
    expect(JSON.stringify(pinned.snapshot())).not.toContain("private response body");
  });
});
