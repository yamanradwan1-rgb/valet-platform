import { describe, expect, it, vi } from "vitest";
import type { ConditionPhotoUploadStatus } from "@valet/contracts";
import { EmployeeApiError, EmployeeConditionPhotoSession,
  type ConditionPhotoTransport } from "@valet/employee-client";
import type { NativeConditionPhotoFiles } from "../src/check-in/native-condition-photo-files";
import { elements } from "./native-check-in-condition-test-support";

// Exercise the real camera callbacks and photo session without loading Expo.
const hooks: unknown[] = [];
const cleanups: (() => void)[] = [];
let cursor = 0;
let mounting = false;
vi.mock("react", () => ({
  useRef: (current: unknown) => {
    const index = cursor++;
    return hooks[index] ??= { current };
  },
  useState: (initial: unknown) => {
    const index = cursor++;
    if (mounting) hooks[index] = typeof initial === "function" ? initial() : initial;
    return [hooks[index], (next: unknown) => {
      hooks[index] = typeof next === "function" ? next(hooks[index]) : next;
    }];
  },
  useEffect: (effect: () => void | (() => void)) => {
    if (!mounting) return;
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  },
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) => current(),
}));
vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  Image: "Image", Modal: "Modal", Pressable: "Pressable",
  ScrollView: "ScrollView", Text: "Text", View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  Linking: { openSettings: vi.fn() },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("expo-camera", () => ({
  Camera: { getCameraPermissionsAsync: async () => ({ granted: true, canAskAgain: true }) },
  CameraView: "CameraView",
}));
vi.mock("../src/employee-ui/employee-controls", () => ({ EmployeeButton: "EmployeeButton" }));
vi.mock("../src/check-in/native-check-in-primitives", () => ({ CheckInButton: "CheckInButton" }));
vi.mock("../src/telemetry/native-telemetry-owner", () => ({
  getNativeTelemetry: () => ({ pinned: { begin: vi.fn(), stage: vi.fn(), complete: vi.fn(), cancel: vi.fn() } }),
}));

const { NativeConditionPhotoCamera } = await import("../src/check-in/native-condition-photo-camera");
const { NativeConditionPhotoStatus } = await import("../src/check-in/native-condition-photo-status");
const { nativeConditionPhotoCopy } = await import("../src/check-in/native-condition-photo-copy");
const copy = nativeConditionPhotoCopy("en");
const scope = {
  authGeneration: 1, identityGeneration: 1, sessionId: "session-a", locationId: "location-a",
  organizationId: "org-a", membershipId: "member-a", workflowOwner: "owner-a",
};
const operationId = "operation-a";
const handle = "new-owned-jpeg";
const thumbnail = "file:///private/new-thumb.jpg";

async function fixture() {
  hooks.length = cleanups.length = 0;
  const uploadResult = Promise.withResolvers<ConditionPhotoUploadStatus>();
  const prepare = Promise.withResolvers<string | null>();
  const transport = {
    discover: vi.fn<ConditionPhotoTransport["discover"]>(async () => ({
      valetSessionId: scope.sessionId, qualifyingPhotoPresent: false,
      photoPolicy: { required: true, source: "LOCATION_OVERRIDE" as const },
      pendingOperation: null, latestOperation: null,
    })),
    status: vi.fn(), reconcile: vi.fn(),
    upload: vi.fn<ConditionPhotoTransport["upload"]>(() => uploadResult.promise),
  };
  const discard = vi.fn(async () => {});
  const discardThumbnail = vi.fn(async () => {});
  const photo = new EmployeeConditionPhotoSession({
    transport, createOperationId: () => operationId, discard, discardThumbnail,
  });
  await photo.activate(scope);
  const files = {
    canCapture: () => true, beginCapture: vi.fn(), finishCapture: vi.fn(),
    capture: vi.fn(async () => handle), preview: () => "file:///private/review.jpg", discard,
  };
  const unmount = () => { cleanups.splice(0).forEach((cleanup) => cleanup()); };
  const onClose = vi.fn(unmount);
  const onPrepareCapture = vi.fn(() => prepare.promise);
  const onReleaseCapture = vi.fn();
  const props = { photo, files: files as unknown as NativeConditionPhotoFiles,
    onClose, onPrepareCapture, onReleaseCapture, locale: "en" as const };
  const render = () => {
    cursor = 0;
    mounting = hooks.length === 0;
    return elements(NativeConditionPhotoCamera(props));
  };
  const press = (label: string) => {
    const node = render().find((item) => item.props.label === label);
    expect(node).toBeDefined();
    return node!.props.onPress as () => void;
  };
  const startReview = async () => {
    render();
    await vi.waitFor(() => expect(render().some((node) => node.type === "CameraView")).toBe(true));
    const camera = render().find((node) => node.type === "CameraView")!;
    (camera.props.ref as { current: unknown }).current = {
      takePictureAsync: async () => ({ uri: "file:///private/raw.jpg", width: 1600, height: 1200 }),
    };
    (camera.props.onCameraReady as () => void)();
    press(copy.capture)();
    await vi.waitFor(() => expect(render().some((node) => node.props.label === copy.confirm)).toBe(true));
  };
  const cardActions = () => {
    // The card is a separate component instance from the camera modal.
    cursor = 0;
    mounting = true;
    return elements(NativeConditionPhotoStatus({ ...props, snapshot: photo.current() }))
      .map((node) => node.props.label);
  };
  return { photo, transport, discard, discardThumbnail, uploadResult, prepare, onClose,
    onPrepareCapture, onReleaseCapture, unmount, press, startReview, cardActions, render };
}

describe("#453 Native condition-photo confirmation", () => {
  it("dispatches only the newly confirmed JPEG, closes before the response, and keeps slot attribution", async () => {
    const f = await fixture();
    expect(f.photo.capture("older-local-jpeg")).toBe(true);
    await f.startReview();
    const confirm = f.press(copy.confirm);
    confirm();
    confirm();
    expect(f.onPrepareCapture).toHaveBeenCalledExactlyOnceWith(handle);
    expect(f.transport.upload).not.toHaveBeenCalled();
    f.prepare.resolve(thumbnail);
    await vi.waitFor(() => expect(f.onClose).toHaveBeenCalledTimes(1));
    expect(f.transport.upload).toHaveBeenCalledExactlyOnceWith(
      scope.sessionId, operationId, handle, expect.any(AbortSignal),
    );
    expect(f.transport.upload.mock.invocationCallOrder[0]).toBeLessThan(f.onClose.mock.invocationCallOrder[0]!);
    expect(f.discard).not.toHaveBeenCalled();
    expect(f.onReleaseCapture).not.toHaveBeenCalled();
    expect(f.photo.current().slots.map((slot) => [slot.slotId, slot.phase, slot.thumbnailUri])).toEqual([
      [1, "CAPTURED_LOCAL", null], [2, "UPLOADING", thumbnail], [3, "EMPTY", null], [4, "EMPTY", null],
    ]);
    expect(f.photo.current().qualifying).toBe(false);
    expect(f.transport.upload.mock.calls).toHaveLength(1);
  });

  it.each([copy.retake, copy.close])("discards a review on %s before confirmation", async (label) => {
    const f = await fixture();
    await f.startReview();
    f.press(label)();
    expect(f.discard).toHaveBeenCalledExactlyOnceWith(handle);
    expect(f.onPrepareCapture).not.toHaveBeenCalled();
    expect(f.transport.upload).not.toHaveBeenCalled();
    expect(f.photo.current().capturedCount).toBe(0);
  });

  it("ignores preparation that finishes after modal unmount", async () => {
    const f = await fixture();
    await f.startReview();
    f.press(copy.confirm)();
    f.unmount();
    f.prepare.resolve(null);
    await f.prepare.promise;
    expect(f.onReleaseCapture).toHaveBeenCalledExactlyOnceWith(handle);
    expect(f.discard).toHaveBeenCalledExactlyOnceWith(handle);
    expect(f.transport.upload).not.toHaveBeenCalled();
    expect(f.photo.current().capturedCount).toBe(0);
  });

  it("ignores preparation after route blur while the modal is still mounted", async () => {
    const f = await fixture();
    await f.startReview();
    f.press(copy.confirm)();
    f.photo.suspend();
    f.prepare.resolve(null);
    await f.prepare.promise;
    expect(f.transport.upload).not.toHaveBeenCalled();
    expect(f.photo.current().capturedCount).toBe(0);
    f.unmount();
    expect(f.discard).toHaveBeenCalledExactlyOnceWith(handle);
  });

  it.each([{ sessionId: "session-b" }, { locationId: "location-b" }, { authGeneration: 2 }])(
    "ignores preparation after a scope change %j", async (change) => {
      const f = await fixture();
      await f.startReview();
      f.press(copy.confirm)();
      await f.photo.activate({ ...scope, ...change });
      f.prepare.resolve(null);
      await f.prepare.promise;
      expect(f.transport.upload).not.toHaveBeenCalled();
      expect(f.photo.current().capturedCount).toBe(0);
      f.unmount();
      expect(f.discard).toHaveBeenCalledExactlyOnceWith(handle);
    },
  );

  it("reports a thumbnail preparation exception without dispatching", async () => {
    const f = await fixture();
    await f.startReview();
    f.press(copy.confirm)();
    f.prepare.reject(new Error("thumbnail preparation unavailable"));
    await vi.waitFor(() => expect(f.render().some((node) => node.props.children === copy.cameraFailure)).toBe(true));
    expect(f.onClose).not.toHaveBeenCalled();
    expect(f.transport.upload).not.toHaveBeenCalled();
    f.press(copy.retake)();
    expect(f.discard).toHaveBeenCalledExactlyOnceWith(handle);
  });

  it("does not dispatch when the gallery rejects a prepared JPEG", async () => {
    const f = await fixture();
    await f.startReview();
    f.press(copy.confirm)();
    for (const older of ["a", "b", "c", "d"]) expect(f.photo.capture(older)).toBe(true);
    f.prepare.resolve(thumbnail);
    await f.prepare.promise;
    expect(f.discard).toHaveBeenCalledExactlyOnceWith(handle);
    expect(f.discardThumbnail).toHaveBeenCalledExactlyOnceWith(thumbnail);
    expect(f.transport.upload).not.toHaveBeenCalled();
    expect(f.onClose).not.toHaveBeenCalled();
  });

  it.each(["offline", "timeout", "lost response"])("checks the exact operation after %s", async (failure) => {
    const f = await fixture();
    await f.startReview();
    f.press(copy.confirm)();
    f.prepare.resolve(thumbnail);
    await vi.waitFor(() => expect(f.onClose).toHaveBeenCalledTimes(1));
    f.uploadResult.reject(new Error(failure));
    await vi.waitFor(() => expect(f.photo.current().phase).toBe("unknown"));
    expect(f.photo.current().qualifying).toBe(false);
    expect(f.cardActions()).toContain(copy.check);
    expect(f.cardActions()).not.toContain(copy.resend);
    f.transport.status.mockResolvedValueOnce({ status: "REJECTED", valetSessionId: scope.sessionId,
      operationId, retryAction: "NEW_CAPTURE", reason: "INVALID_IMAGE" });
    await f.photo.checkServer();
    expect(f.transport.status).toHaveBeenCalledExactlyOnceWith(scope.sessionId, operationId, expect.any(AbortSignal));
    expect(f.transport.upload).toHaveBeenCalledTimes(1);
    expect(f.photo.current().slots[0]).toMatchObject({ phase: "UPLOAD_FAILED", hasCapture: false });
    expect(f.cardActions()).toContain(copy.retake);
  });

  it("purges owned evidence when an in-flight upload loses authorization", async () => {
    const f = await fixture();
    await f.startReview();
    f.press(copy.confirm)();
    f.prepare.resolve(thumbnail);
    await vi.waitFor(() => expect(f.onClose).toHaveBeenCalledTimes(1));
    f.uploadResult.reject(new EmployeeApiError({ status: 401, code: "UNAUTHORIZED", message: "Revoked" }));
    await vi.waitFor(() => expect(f.photo.current().scope).toBeNull());
    expect(f.discard).toHaveBeenCalledWith(handle);
    expect(f.discardThumbnail).toHaveBeenCalledExactlyOnceWith(thumbnail);
    expect(f.transport.upload).toHaveBeenCalledTimes(1);
  });

  it("keeps the preview-unavailable fallback and waits for discovery after POST verification", async () => {
    const f = await fixture();
    await f.startReview();
    f.press(copy.confirm)();
    f.prepare.resolve(null);
    await vi.waitFor(() => expect(f.onClose).toHaveBeenCalledTimes(1));
    expect(f.photo.current().slots[0]).toMatchObject({ phase: "UPLOADING", previewUnavailable: true });
    const discovery = Promise.withResolvers<Awaited<ReturnType<ConditionPhotoTransport["discover"]>>>();
    f.transport.discover.mockReturnValueOnce(discovery.promise);
    f.uploadResult.resolve({ status: "VERIFIED", valetSessionId: scope.sessionId,
      operationId, vehiclePhotoId: "evidence-a", contentType: "image/jpeg", byteSize: 1200,
      verifiedAt: "2026-11-12T00:00:00.000Z" });
    await vi.waitFor(() => expect(f.photo.current().uploadedCount).toBe(1));
    expect(f.photo.current().qualifying).toBe(false);
    discovery.resolve({ valetSessionId: scope.sessionId, qualifyingPhotoPresent: true,
      photoPolicy: { required: true, source: "LOCATION_OVERRIDE" },
      pendingOperation: null, latestOperation: null });
    await vi.waitFor(() => expect(f.photo.current().qualifying).toBe(true));
    expect(f.transport.upload).toHaveBeenCalledTimes(1);
  });

  it.each(["RECONCILE", "RESEND_SAME_BYTES"] as const)(
    "removes the card confirmation and keeps explicit %s recovery", async (retryAction) => {
      const f = await fixture();
      expect(f.photo.capture("original-jpeg")).toBe(true);
      expect(f.cardActions()).not.toContain(copy.confirm);
      const upload = f.photo.upload();
      f.uploadResult.resolve({ status: "PENDING", valetSessionId: scope.sessionId,
        operationId, retryAction, retryAfterSeconds: 1 });
      await upload;
      expect(f.cardActions()).toContain(copy.check);
      expect(f.cardActions()).toContain(retryAction === "RECONCILE" ? copy.reconcile : copy.resend);
      expect(f.cardActions()).not.toContain(copy.confirm);
    },
  );
});
