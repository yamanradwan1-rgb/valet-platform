import { describe, expect, it, vi } from "vitest";
import type { ConditionPhotoTransport } from "./employee-condition-photo-transport";
import { EmployeeConditionPhotoGallery } from "./employee-condition-photo-gallery";
import { EmployeeConditionPhotoSession } from "./employee-condition-photo-session";

const sessionId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const pending = {
  valetSessionId: sessionId, operationId, status: "PENDING" as const,
  retryAction: "RESEND_SAME_BYTES" as const, retryAfterSeconds: 1,
};
const verified = {
  valetSessionId: sessionId, operationId, status: "VERIFIED" as const,
  vehiclePhotoId: "33333333-3333-4333-8333-333333333333",
  byteSize: 1200, contentType: "image/jpeg" as const,
  verifiedAt: "2026-10-29T00:00:00.000Z",
};

describe("Issue #336 missing JPEG during same-byte resend", () => {
  it("preserves exact pending operation and truthful counters when original bytes vanish", async () => {
    let jpegAvailable = true;
    const transport = {
      discover: vi.fn().mockResolvedValue({
        valetSessionId: sessionId, photoPolicy: { required: false,
          source: "ORGANIZATION_DEFAULT" }, qualifyingPhotoPresent: false,
        pendingOperation: null, latestOperation: null,
      }),
      summary: vi.fn().mockResolvedValue({ valetSessionId: sessionId,
        verifiedTotal: 0, latestVerified: [] }),
      status: vi.fn().mockResolvedValue(verified),
      reconcile: vi.fn().mockResolvedValue(verified),
      upload: vi.fn().mockResolvedValue(pending),
    } satisfies ConditionPhotoTransport;
    const discard = vi.fn().mockResolvedValue(undefined);
    const session = new EmployeeConditionPhotoSession({ transport, discard,
      captureReady: () => jpegAvailable, createOperationId: () => operationId });
    await session.activate({ authGeneration: 1, identityGeneration: 1,
      membershipId: "member-a", organizationId: "org-a", locationId: "loc-a",
      sessionId, workflowOwner: "owner-a" });
    expect(session.capture("private-original", "file:///private/thumb.jpg")).toBe(true);
    await session.upload();
    expect(session.current().phase).toBe("pending");
    expect(session.current().capturedCount).toBe(1);
    jpegAvailable = false;
    await session.upload();
    expect(transport.upload).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledWith("private-original");
    expect(session.current().phase).toBe("unknown");
    expect(session.current().status).toMatchObject(pending);
    expect([session.current().capturedCount, session.current().uploadedCount])
      .toEqual([0, 0]);
    const slot = session.current().slots.find((item) => item.operationId === operationId);
    expect(slot).toMatchObject({ phase: "RETRY_PENDING", hasCapture: false });
    transport.summary.mockResolvedValue({ valetSessionId: sessionId,
      verifiedTotal: 1, latestVerified: [{ operationId,
        vehiclePhotoId: verified.vehiclePhotoId, verifiedAt: verified.verifiedAt,
        status: "VERIFIED" }] });
    await session.checkServer();
    expect(transport.status).toHaveBeenCalledWith(sessionId, operationId,
      expect.any(AbortSignal));
    expect(session.current().uploadedCount).toBe(1);
  });

  it("prioritizes the exact pending operation over a different local slot", () => {
    const gallery = new EmployeeConditionPhotoGallery();
    gallery.capture("local-A", null);
    gallery.capture("pending-B", null);
    expect(gallery.begin(2, operationId)).toBe(true);
    gallery.accept(pending);
    expect(gallery.uploadCandidate(true)).toMatchObject({ slotId: 2, operationId });
    expect(gallery.uploadCandidate(false)).toMatchObject({ slotId: 1 });
  });
});
