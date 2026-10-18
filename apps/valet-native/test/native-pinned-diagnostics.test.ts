import { describe, expect, it } from "vitest";
import { NativePinnedDiagnostics } from "../src/telemetry/native-pinned-diagnostics";

describe("Issue #302/#303 pinned diagnostic ownership", () => {
  it("retains independent completed results during a newer attempt and rejects late completions", () => {
    const owner = new NativePinnedDiagnostics();
    const oldPhoto = owner.begin("photo");
    owner.stage("photo", oldPhoto, "camera-capture", "error");
    owner.complete("photo", oldPhoto, "failed", "not-attempted");
    const first = owner.snapshot().photo.lastCompleted;
    expect(first).toMatchObject({
      firstFailedStage: "camera-capture",
      status: "failed",
      transport: "not-attempted",
    });
    const next = owner.begin("photo");
    expect(owner.snapshot().photo).toMatchObject({
      running: true,
      lastCompleted: first,
    });
    owner.stage("photo", oldPhoto, "jpeg-save", "error");
    owner.complete("photo", oldPhoto, "success", "verified");
    expect(owner.snapshot().photo.lastCompleted).toEqual(first);
    owner.stage("photo", next, "photo-handle-uuid", "error");
    owner.stage("photo", next, "cleanup", "error");
    owner.complete("photo", next, "failed", "not-attempted");
    expect(owner.snapshot().photo.lastCompleted?.firstFailedStage)
      .toBe("photo-handle-uuid");
    expect(owner.snapshot().photo.running).toBe(false);
  });

  it("never crosses category boundaries and keeps immutable snapshots", () => {
    const owner = new NativePinnedDiagnostics();
    const incident = owner.begin("incident");
    owner.stage("incident", incident, "secure-uuid", "error");
    owner.complete("incident", incident, "failed", "not-attempted");
    const before = owner.snapshot();
    const photo = owner.begin("photo");
    owner.stage("photo", photo, "camera-capture", "success");
    owner.complete("photo", photo, "success", "not-attempted");
    const crypto = owner.begin("crypto");
    owner.stage("crypto", crypto, "get-random-values", "error");
    owner.complete("crypto", crypto, "failed", "not-attempted");
    expect(owner.snapshot().incident.lastCompleted)
      .toEqual(before.incident.lastCompleted);
    expect(before.photo.lastCompleted).toBeNull();
    expect(before.crypto.lastCompleted).toBeNull();
  });

  it("rejects unknown stages/status values and clears volatile history on restart", () => {
    const owner = new NativePinnedDiagnostics();
    const attempt = owner.begin("photo");
    owner.stage("photo", attempt, "file:///private/cache/photo.jpg" as never, "error");
    owner.stage("photo", attempt, "camera-capture", "error");
    owner.complete("photo", attempt, "failed", "not-attempted");
    expect(JSON.stringify(owner.snapshot())).not.toContain("file://");
    expect(new NativePinnedDiagnostics().snapshot().photo.lastCompleted).toBeNull();
  });
});
