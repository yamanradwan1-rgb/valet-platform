import { describe, expect, it, vi } from "vitest";
import type { ConditionPhotoEvidenceSummary, ConditionPhotoUploadStatus } from
  "@valet/contracts";
import { EmployeeConditionPhotoSession } from "./employee-condition-photo-session";
import type { ConditionPhotoScope } from "./employee-condition-photo-state";
import type { ConditionPhotoTransport } from "./employee-condition-photo-transport";
import { EmployeeApiError } from "./api-error";

const sessionId = "11111111-1111-4111-8111-111111111111";
const scope: ConditionPhotoScope = {
  authGeneration: 1, identityGeneration: 1, membershipId: "member-a",
  organizationId: "org-a", locationId: "loc-a", sessionId, workflowOwner: "owner-a",
};
const operation = (tail: number) => `22222222-2222-4222-8222-22222222222${tail}`;
const photo = (tail: number) => `33333333-3333-4333-8333-33333333333${tail}`;
const verified = (tail: number): ConditionPhotoUploadStatus => ({
  valetSessionId: sessionId, operationId: operation(tail),
  vehiclePhotoId: photo(tail), status: "VERIFIED", byteSize: 1200,
  contentType: "image/jpeg", verifiedAt: `2026-10-29T00:00:0${tail}.000Z`,
});
const discovery = (latest: ConditionPhotoUploadStatus | null = null) => ({
  valetSessionId: sessionId,
  photoPolicy: { required: false as const, source: "ORGANIZATION_DEFAULT" as const },
  qualifyingPhotoPresent: latest?.status === "VERIFIED",
  latestOperation: latest?.status === "VERIFIED" ? latest : null,
  pendingOperation: null,
});
const summary = (total: number, items: readonly number[]): ConditionPhotoEvidenceSummary => ({
  valetSessionId: sessionId, verifiedTotal: total,
  latestVerified: items.map((tail) => ({ operationId: operation(tail),
    vehiclePhotoId: photo(tail), verifiedAt: `2026-10-29T00:00:0${tail}.000Z`,
    status: "VERIFIED" })),
});

function fixture() {
  let nextId = 0;
  const committed: number[] = [];
  const transport = {
    discover: vi.fn().mockResolvedValue(discovery()),
    summary: vi.fn().mockImplementation(async () =>
      summary(committed.length, [...committed].reverse())),
    status: vi.fn().mockResolvedValue(verified(1)),
    reconcile: vi.fn().mockResolvedValue(verified(1)),
    upload: vi.fn().mockImplementation(async (_sessionId, op: string) => {
      const tail = Number(op.at(-1));
      committed.push(tail);
      return verified(tail);
    }),
  } satisfies ConditionPhotoTransport;
  const discard = vi.fn().mockResolvedValue(undefined);
  const discardThumbnail = vi.fn().mockResolvedValue(undefined);
  const session = new EmployeeConditionPhotoSession({ transport, discard,
    discardThumbnail, createOperationId: () => operation(++nextId) });
  return { session, transport, discard, discardThumbnail };
}

describe("Issue #336 B1 four-slot client state", () => {
  it("counts 3 captured and 2 verified, retaining real local thumbnails", async () => {
    const { session, transport, discard } = fixture();
    await session.activate(scope);
    for (let i = 1; i <= 2; i += 1) {
      expect(session.capture(`source-${i}`, `file:///private/thumb-${i}.jpg`)).toBe(true);
      await session.upload();
      await vi.waitFor(() => expect(session.current().uploadedCount).toBe(i));
    }
    expect(session.capture("source-3", "file:///private/thumb-3.jpg")).toBe(true);
    const state = session.current();
    expect(state.capturedCount).toBe(3);
    expect(state.uploadedCount).toBe(2);
    expect(state.slots[0]?.thumbnailUri).toBe("file:///private/thumb-1.jpg");
    expect(state.slots[2]?.phase).toBe("CAPTURED_LOCAL");
    expect(discard).toHaveBeenCalledWith("source-1");
    expect(transport.upload).toHaveBeenCalledTimes(2);
  });

  it("fixes stale Discovery A replacing newer unresolved operation B", async () => {
    const { session, transport } = fixture();
    transport.summary.mockResolvedValue(summary(1, [1]));
    await session.activate(scope);
    session.capture("source-A", "file:///private/a.jpg");
    await session.upload();
    await vi.waitFor(() => expect(session.current().uploadedCount).toBe(1));
    transport.discover.mockResolvedValue(discovery(verified(1)));
    expect(session.capture("source-B", "file:///private/b.jpg")).toBe(true);
    transport.upload.mockRejectedValueOnce(new Error("timeout after commit"));
    await session.upload();
    expect(session.current().phase).toBe("unknown");
    await session.discover(); // returns old verified A, not operation B
    expect(session.current().phase).toBe("unknown");
    expect(session.current().uploadedCount).toBe(1);
    transport.status.mockResolvedValue(verified(2));
    await session.checkServer();
    expect(transport.status).toHaveBeenCalledWith(sessionId, operation(2),
      expect.any(AbortSignal));
    expect(session.current().uploadedCount).toBe(2);
    expect(new Set(session.current().slots.map((slot) => slot.vehiclePhotoId))
      .size).toBeGreaterThan(2);
  });

  it.each([5, 6, 9, 10])(
    "rehydrates newest four of %i with unavailable local previews after restart",
    async (total) => {
      const { session, transport } = fixture();
      transport.summary.mockResolvedValue(summary(total, [4, 3, 2, 1]));
      await session.activate(scope);
      const state = session.current();
      expect(state.verifiedTotal).toBe(total);
      expect([state.capturedCount, state.uploadedCount]).toEqual([4, 4]);
      expect(state.slots.map((slot) => slot.vehiclePhotoId)).toEqual(
        [photo(1), photo(2), photo(3), photo(4)]);
      expect(state.slots.every((slot) => slot.previewUnavailable &&
        slot.thumbnailUri === null)).toBe(true);
      expect(session.capture("fifth-source")).toBe(false);
    },
  );

  it("retake protects verified evidence and cleans only unverified previews", async () => {
    const { session, discard, discardThumbnail } = fixture();
    await session.activate(scope);
    session.capture("source-1", "file:///private/one.jpg");
    expect(session.retake(1)).toBe(true);
    expect(discard).toHaveBeenCalledWith("source-1");
    expect(discardThumbnail).toHaveBeenCalledWith("file:///private/one.jpg");
    expect(session.current().capturedCount).toBe(0);
    session.capture("source-2", "file:///private/two.jpg");
    await session.upload();
    expect(session.retake(1)).toBe(false);
    expect(session.current().uploadedCount).toBe(1);
  });

  it("orders the sliding newest-four window chronologically, retaining identities", async () => {
    const { session, transport } = fixture();
    transport.summary.mockResolvedValueOnce(summary(4, [4, 3, 2, 1]));
    await session.activate(scope);
    expect(session.current().slots.map((slot) => slot.vehiclePhotoId)).toEqual(
      [photo(1), photo(2), photo(3), photo(4)]);
    transport.summary.mockResolvedValue(summary(5, [5, 4, 3, 2]));
    await session.discover();
    expect(session.current().slots.map((slot) => slot.vehiclePhotoId)).toEqual(
      [photo(2), photo(3), photo(4), photo(5)]);
    expect(new Set(session.current().slots.map((slot) => slot.slotId)).size).toBe(4);
    expect(session.current().uploadedCount).toBe(4);
  });

  it("keeps pending operation B while discovery still reports older A", async () => {
    const { session, transport } = fixture();
    await session.activate(scope);
    session.capture("original-A", "file:///private/a.jpg");
    await session.upload();
    await vi.waitFor(() => expect(session.current().uploadedCount).toBe(1));
    transport.discover.mockResolvedValue(discovery(verified(1)));
    await session.discover();
    expect(session.current().qualifying).toBe(true);
    session.capture("original-B", "file:///private/b.jpg");
    transport.upload.mockResolvedValueOnce({
      valetSessionId: sessionId, operationId: operation(2), status: "PENDING",
      retryAction: "RECONCILE", retryAfterSeconds: 2,
    });
    await session.upload();
    expect(session.current().phase).toBe("pending");
    await session.discover();
    expect(session.current().phase).toBe("pending");
    expect(session.current().status?.operationId).toBe(operation(2));
    transport.reconcile.mockResolvedValue(verified(2));
    await session.reconcile();
    expect(transport.reconcile).toHaveBeenCalledWith(sessionId, operation(2),
      expect.any(AbortSignal));
    expect(session.current().uploadedCount).toBe(2);
  });

  it("invalidates a missing upload JPEG in both counters and future eligibility", async () => {
    const { transport, discard } = fixture();
    const session = new EmployeeConditionPhotoSession({
      transport, discard, captureReady: () => false,
      createOperationId: () => operation(1),
    });
    await session.activate(scope);
    session.capture("deleted-JPEG", "file:///private/thumbnail.jpg");
    expect(session.current().capturedCount).toBe(1);
    await session.upload();
    expect([session.current().capturedCount, session.current().uploadedCount])
      .toEqual([0, 0]);
    expect(session.current().slots.some((slot) => slot.phase === "UPLOAD_FAILED"))
      .toBe(true);
    await session.upload();
    expect(transport.upload).not.toHaveBeenCalled();
    expect(session.retake(1)).toBe(true);
    expect(session.current().capturedCount).toBe(0);
  });

  it("retakes one of multiple local captures without losing the other", async () => {
    const { session } = fixture();
    await session.activate(scope);
    session.capture("first", "file:///private/first.jpg");
    session.capture("second", "file:///private/second.jpg");
    expect(session.retake(1)).toBe(true);
    expect(session.current().phase).toBe("captured");
    expect(session.current().capturedCount).toBe(1);
    await session.upload();
    expect(session.current().uploadedCount).toBe(1);
    expect(session.current().capturedCount).toBe(1);
  });

  it("keeps authoritative eligibility after A is verified while B is local", async () => {
    const { session, transport } = fixture();
    await session.activate(scope);
    session.capture("source-A");
    await session.upload();
    transport.discover.mockResolvedValue(discovery(verified(1)));
    await session.discover();
    expect(session.current().qualifying).toBe(true);
    session.capture("source-B");
    expect(session.current().qualifying).toBe(true);
    transport.upload.mockRejectedValueOnce(new Error("network"));
    await session.upload();
    expect(session.current().qualifying).toBe(true);
  });

  it("rejects generated operation-ID collisions across distinct slots", async () => {
    const { transport, discard } = fixture();
    const session = new EmployeeConditionPhotoSession({
      transport, discard, createOperationId: () => operation(1),
    });
    await session.activate(scope);
    session.capture("first");
    await session.upload();
    session.capture("second");
    await session.upload();
    expect(transport.upload).toHaveBeenCalledTimes(1);
    expect(session.current().error).toBe("RESPONSE");
    expect(session.current().uploadedCount).toBe(1);
    expect(session.current().capturedCount).toBe(2);
  });

  it("counts each of four independently verified slots exactly once", async () => {
    const { session, transport } = fixture();
    await session.activate(scope);
    expect([session.current().capturedCount, session.current().uploadedCount])
      .toEqual([0, 0]);
    for (let index = 1; index <= 4; index += 1) {
      expect(session.capture(`capture-${index}`,
        `file:///private/thumb-${index}.jpg`)).toBe(true);
      await session.upload();
      await vi.waitFor(() => expect(session.current().uploadedCount).toBe(index));
      expect(session.current().capturedCount).toBe(index);
    }
    expect(session.capture("fifth")).toBe(false);
    expect(transport.upload).toHaveBeenCalledTimes(4);
    expect(new Set(session.current().slots.map((slot) => slot.vehiclePhotoId)).size)
      .toBe(4);
    transport.status.mockResolvedValue(verified(4));
    await session.checkServer();
    expect(session.current().uploadedCount).toBe(4);
  });

  it("resends the same bytes and operation identity only when the server permits it", async () => {
    const { session, transport } = fixture();
    await session.activate(scope);
    session.capture("same-owned-JPEG", "file:///private/same.jpg");
    transport.upload.mockResolvedValueOnce({
      valetSessionId: sessionId, operationId: operation(1), status: "PENDING",
      retryAction: "RESEND_SAME_BYTES", retryAfterSeconds: 1,
    });
    await session.upload();
    expect(session.current().phase).toBe("pending");
    await session.upload();
    expect(transport.upload).toHaveBeenCalledTimes(2);
    expect(transport.upload.mock.calls[0]?.slice(0, 3)).toEqual(
      transport.upload.mock.calls[1]?.slice(0, 3));
    expect(session.current().uploadedCount).toBe(1);
  });

  it("purges authenticated photo scope and private preview on grant revocation", async () => {
    const { session, transport, discardThumbnail } = fixture();
    await session.activate(scope);
    session.capture("owned-JPEG", "file:///private/revoked.jpg");
    await session.upload();
    await session.discover();
    expect(session.current().uploadedCount).toBe(1);
    transport.discover.mockRejectedValueOnce(new EmployeeApiError({
      status: 403, code: "FORBIDDEN", message: "grant revoked",
    }));
    await session.discover();
    expect(session.current().scope).toBeNull();
    expect([session.current().capturedCount, session.current().uploadedCount])
      .toEqual([0, 0]);
    expect(discardThumbnail).toHaveBeenCalledWith("file:///private/revoked.jpg");
  });
});
