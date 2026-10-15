import { describe, expect, it, vi } from "vitest";
import type {
  ConditionPhotoStateDiscovery,
  ConditionPhotoUploadStatus,
} from "@valet/contracts";
import { EmployeeConditionPhotoSession } from "./employee-condition-photo-session";
import type { ConditionPhotoScope } from "./employee-condition-photo-state";
import type { ConditionPhotoTransport } from "./employee-condition-photo-transport";

const sessionId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";
const scope: ConditionPhotoScope = {
  authGeneration: 1, identityGeneration: 2, membershipId: "member-a",
  organizationId: "org-a", locationId: "loc-a", sessionId,
  workflowOwner: "workflow-a",
};
const verified: ConditionPhotoUploadStatus = {
  valetSessionId: sessionId, operationId, status: "VERIFIED", vehiclePhotoId: photoId,
  byteSize: 1234, contentType: "image/jpeg", verifiedAt: "2026-10-15T10:00:00.000Z",
};
const pending: ConditionPhotoUploadStatus = {
  valetSessionId: sessionId, operationId, status: "PENDING",
  retryAction: "RECONCILE", retryAfterSeconds: 2,
};
function discovery(overrides: Partial<ConditionPhotoStateDiscovery> = {}): ConditionPhotoStateDiscovery {
  return {
    valetSessionId: sessionId, photoPolicy: { required: true, source: "LOCATION_OVERRIDE" },
    qualifyingPhotoPresent: false, pendingOperation: null, latestOperation: null,
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const transport = {
    discover: vi.fn().mockResolvedValue(discovery()),
    status: vi.fn().mockResolvedValue(pending),
    reconcile: vi.fn().mockResolvedValue(pending),
    upload: vi.fn().mockResolvedValue(verified),
  } satisfies ConditionPhotoTransport;
  const discard = vi.fn().mockResolvedValue(undefined);
  const session = new EmployeeConditionPhotoSession({
    createOperationId: () => operationId, discard, transport,
  });
  return { transport, discard, session };
}

describe("condition photo portable lifecycle", () => {
  it("uses a single confirmed upload and only authoritative discovery unblocks required Check-In", async () => {
    const { transport, session, discard } = fixture();
    const upload = deferred<ConditionPhotoUploadStatus>();
    transport.upload.mockReturnValue(upload.promise);
    await session.activate(scope);
    expect(session.current().required).toBe(true);
    expect(session.current().qualifying).toBe(false);
    expect(session.capture("opaque-1")).toBe(true);
    const first = session.upload();
    await session.upload();
    expect(transport.upload).toHaveBeenCalledTimes(1);
    expect(session.current().phase).toBe("uploading");
    expect(session.current().qualifying).toBe(false);
    transport.discover.mockResolvedValue(discovery({
      qualifyingPhotoPresent: true, latestOperation: verified,
    }));
    upload.resolve(verified);
    await first;
    await Promise.resolve();
    await vi.waitFor(() => expect(session.current().qualifying).toBe(true));
    expect(discard).toHaveBeenCalledWith("opaque-1");
    expect(transport.discover).toHaveBeenCalledTimes(2);
  });

  it("after lost response checks GET, discovers server commit and never silently replays POST", async () => {
    const { transport, session } = fixture();
    transport.upload.mockRejectedValue(new Error("socket closed"));
    transport.status.mockResolvedValue(verified);
    await session.activate(scope);
    session.capture("opaque-lost");
    await session.upload();
    expect(session.current().phase).toBe("unknown");
    expect(session.current().qualifying).toBe(false);
    transport.discover.mockResolvedValue(discovery({
      qualifyingPhotoPresent: true, latestOperation: verified,
    }));
    await session.checkServer();
    expect(session.current().qualifying).toBe(true);
    expect(transport.upload).toHaveBeenCalledTimes(1);
    expect(transport.status).toHaveBeenCalledWith(sessionId, operationId, expect.any(AbortSignal));
  });

  it("revokes any old result after same-account A→B→A and drops old private handle", async () => {
    const { session, transport, discard } = fixture();
    const upload = deferred<ConditionPhotoUploadStatus>();
    transport.upload.mockReturnValue(upload.promise);
    await session.activate(scope);
    session.capture("old-a");
    const old = session.upload();
    const oldRevision = session.current().ownerRevision;
    await session.activate({ ...scope, locationId: "loc-b", workflowOwner: "workflow-b" });
    await session.activate(scope);
    expect(session.current().ownerRevision).toBeGreaterThan(oldRevision);
    upload.resolve(verified);
    await old;
    expect(session.current().phase).toBe("available");
    expect(session.current().qualifying).toBe(false);
    expect(discard).toHaveBeenCalledWith("old-a");
  });

  it("restart rehydrates pending server state with no durable photo handle and explicit reconcile", async () => {
    const { transport, session } = fixture();
    transport.discover.mockResolvedValueOnce(discovery({ pendingOperation: pending }))
      .mockResolvedValue(discovery({ qualifyingPhotoPresent: true, latestOperation: verified }));
    transport.reconcile.mockResolvedValue(verified);
    await session.activate(scope);
    expect(session.current().phase).toBe("pending");
    expect(session.current().hasCapture).toBe(false);
    expect(session.capture("new photo while pending")).toBe(false);
    expect(transport.upload).not.toHaveBeenCalled();
    await session.reconcile();
    expect(transport.reconcile).toHaveBeenCalledTimes(1);
    expect(session.current().qualifying).toBe(true);
    expect(transport.upload).not.toHaveBeenCalled();
  });

  it("keeps unknown after background abort until explicit authoritative read", async () => {
    const { session, transport, discard } = fixture();
    const upload = deferred<ConditionPhotoUploadStatus>();
    transport.upload.mockReturnValue(upload.promise);
    await session.activate(scope);
    session.capture("opaque-2");
    const inflight = session.upload();
    session.suspend();
    upload.resolve(verified);
    await inflight;
    expect(session.current().phase).toBe("unknown");
    expect(session.current().qualifying).toBe(false);
    expect(session.current().hasCapture).toBe(false);
    expect(discard).toHaveBeenCalledWith("opaque-2");
    expect(transport.upload).toHaveBeenCalledTimes(1);
  });

  it("purges unsent captured bytes on background or route blur", async () => {
    const { session, transport, discard } = fixture();
    await session.activate(scope);
    session.capture("unsent-private-JPEG");
    expect(session.current().phase).toBe("captured");
    session.suspend();
    expect(session.current().phase).toBe("available");
    expect(session.current().hasCapture).toBe(false);
    expect(discard).toHaveBeenCalledWith("unsent-private-JPEG");
    expect(transport.upload).not.toHaveBeenCalled();
    await session.discover();
    expect(session.current().phase).toBe("available");
  });

  it("keeps optional no-photo eligibility independent of local photo state", async () => {
    const { session, transport } = fixture();
    transport.discover.mockResolvedValue(discovery({
      photoPolicy: { required: false, source: "ORGANIZATION_DEFAULT" },
    }));
    await session.activate(scope);
    expect(session.current().required).toBe(false);
    expect(session.current().qualifying).toBe(false);
    expect(transport.upload).not.toHaveBeenCalled();
  });

  it("retains original intent when status GET 404 races an earlier dispatched POST", async () => {
    const { session, transport } = fixture();
    transport.upload.mockRejectedValue(new Error("response lost"));
    transport.status.mockRejectedValueOnce(new Error("404 before T1"))
      .mockResolvedValueOnce(verified);
    await session.activate(scope);
    session.capture("original-bytes");
    await session.upload();
    await session.checkServer();
    expect(session.current().phase).toBe("unknown");
    expect(session.capture("different-bytes")).toBe(false);
    transport.discover.mockResolvedValue(discovery({
      qualifyingPhotoPresent: true, latestOperation: verified,
    }));
    await session.checkServer();
    expect(session.current().qualifying).toBe(true);
    expect(transport.status).toHaveBeenNthCalledWith(
      2, sessionId, operationId, expect.any(AbortSignal),
    );
    expect(transport.upload).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or oversized local file before reserving an operation", async () => {
    const { transport, discard } = fixture();
    const session = new EmployeeConditionPhotoSession({
      transport, discard, createOperationId: () => operationId,
      captureReady: () => false,
    });
    await session.activate(scope);
    session.capture("missing-image");
    await session.upload();
    expect(session.current().phase).toBe("rejected");
    expect(session.current().error).toBe("FILE");
    expect(session.current().hasCapture).toBe(false);
    expect(discard).toHaveBeenCalledWith("missing-image");
    expect(transport.upload).not.toHaveBeenCalled();
    expect(session.capture("new-image")).toBe(true);
  });
});
