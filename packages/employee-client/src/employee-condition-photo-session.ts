import type { ConditionPhotoUploadStatus } from "@valet/contracts";
import type { ConditionPhotoTransport } from "./employee-condition-photo-transport";
import { EmployeeConditionPhotoGallery } from "./employee-condition-photo-gallery";
import { conditionPhotoAuthorizationLost } from "./employee-condition-photo-authorization";
import { discoverConditionPhotoGallery } from "./employee-condition-photo-discovery";
import { discardConditionPhotoSources } from "./employee-condition-photo-source-cleanup";
import {
  conditionPhotoScopeKey,
  initialConditionPhotoSnapshot,
  type ConditionPhotoScope,
  type ConditionPhotoSnapshot,
} from "./employee-condition-photo-state";

export interface ConditionPhotoSessionOptions {
  readonly transport: ConditionPhotoTransport;
  readonly createOperationId: () => string;
  readonly discard: (handle: string) => Promise<void>;
  /** Must synchronously validate actual Native file availability before dispatch. */
  readonly captureReady?: (handle: string) => boolean;
  readonly discardThumbnail?: (uri: string) => Promise<void>;
}

/** Private in-memory operation coordination; every server result is scope fenced. */
export class EmployeeConditionPhotoSession {
  private readonly gallery = new EmployeeConditionPhotoGallery();
  private snapshot: ConditionPhotoSnapshot = initialConditionPhotoSnapshot();
  private readonly listeners = new Set<() => void>();
  private handle: string | null = null;
  private operationId: string | null = null;
  private request = 0;
  private ownerRevision = 0;
  private controller: AbortController | null = null;
  private flight = false;

  constructor(private readonly options: ConditionPhotoSessionOptions) {}
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly current = () => this.snapshot;

  private publish(snapshot: ConditionPhotoSnapshot) {
    this.snapshot = { ...snapshot, ...this.gallery.snapshot };
    for (const listener of this.listeners) listener();
  }
  private invalidate() {
    this.request += 1;
    this.controller?.abort();
    this.controller = null;
    this.flight = false;
  }
  private discardOld() {
    const old = this.handle;
    this.handle = null;
    if (old !== null) void this.options.discard(old).catch(() => undefined);
  }
  private discardSources(handles: readonly string[], thumbnails: readonly string[]) {
    discardConditionPhotoSources(this.options, handles, thumbnails);
  }
  activate(scope: ConditionPhotoScope): Promise<void> {
    if (this.snapshot.scope !== null &&
      conditionPhotoScopeKey(this.snapshot.scope) === conditionPhotoScopeKey(scope)) {
      return Promise.resolve();
    }
    this.invalidate();
    this.discardOld();
    const retired = this.gallery.clear();
    this.discardSources(retired.sources, retired.thumbnails);
    this.operationId = null;
    this.publish({ ...initialConditionPhotoSnapshot(),
      ownerRevision: ++this.ownerRevision, scope });
    return this.discover();
  }
  clear(): void {
    this.invalidate();
    this.discardOld();
    const retired = this.gallery.clear();
    this.discardSources(retired.sources, retired.thumbnails);
    this.operationId = null;
    this.publish({ ...initialConditionPhotoSnapshot(),
      ownerRevision: ++this.ownerRevision });
  }
  suspend(): void {
    const wasUploading = this.flight;
    if (this.snapshot.scope === null) return;
    this.invalidate();
    this.discardOld();
    const retired = this.gallery.suspend(wasUploading ? this.operationId : null);
    this.discardSources(retired.sources, retired.thumbnails);
    this.publish({
      ...this.snapshot,
      hasCapture: false,
      phase: wasUploading ? "unknown" :
        this.snapshot.phase === "captured" ?
          this.snapshot.qualifying ? "verified" : "available" :
          this.snapshot.phase,
      error: wasUploading ? "NETWORK" : this.snapshot.error,
    });
  }
  capture(handle: string, thumbnailUri: string | null = null): boolean {
    const state = this.snapshot;
    if (state.scope === null || this.flight ||
      state.status?.status === "PENDING" || state.phase === "unknown") {
      this.discardSources([handle], thumbnailUri ? [thumbnailUri] : []);
      return false;
    }
    if (this.gallery.capture(handle, thumbnailUri) === null) {
      this.discardSources([handle], thumbnailUri ? [thumbnailUri] : []);
      return false;
    }
    this.invalidate();
    this.handle = handle;
    this.operationId = null;
    this.publish({
      ...state, phase: "captured", error: null, status: null,
      qualifying: state.qualifying, captureRevision: state.captureRevision + 1,
      hasCapture: true,
    });
    return true;
  }
  captureFailed(): void {
    if (this.snapshot.scope === null) return;
    this.publish({ ...this.snapshot, error: "CAMERA" });
  }
  /** Retake only a still-local, unverified slot; uncertain operations need exact reconciliation. */
  retake(slotId: number): boolean {
    if (this.flight || this.snapshot.phase === "unknown" ||
        this.snapshot.phase === "pending") return false;
    const removed = this.gallery.retake(slotId);
    if (!removed) return false;
    this.discardSources(removed.source ? [removed.source] : [],
      removed.thumbnailUri ? [removed.thumbnailUri] : []);
    if (this.handle === removed.source) this.handle = null;
    this.operationId = null;
    const next = this.gallery.snapshot;
    this.publish({ ...this.snapshot, status: null,
      hasCapture: next.slots.some((slot) => slot.phase === "CAPTURED_LOCAL"),
      phase: next.slots.some((slot) => slot.phase === "CAPTURED_LOCAL") ?
        "captured" : this.snapshot.qualifying ? "verified" : "available",
      error: null });
    return true;
  }
  private async read(
    action: (signal: AbortSignal, current: () => boolean) => Promise<void>,
    failurePhase: ConditionPhotoSnapshot["phase"] = "unavailable",
  ): Promise<void> {
    if (this.snapshot.scope === null || this.flight) return;
    const scopeKey = conditionPhotoScopeKey(this.snapshot.scope);
    const id = ++this.request;
    const abort = new AbortController();
    this.controller?.abort();
    this.controller = abort;
    const current = () => this.request === id && !abort.signal.aborted &&
      this.snapshot.scope !== null &&
      conditionPhotoScopeKey(this.snapshot.scope) === scopeKey;
    try {
      await action(abort.signal, current);
    } catch (error) {
      if (current()) {
        if (conditionPhotoAuthorizationLost(error)) this.clear();
        else this.publish({ ...this.snapshot, phase: failurePhase, error: "NETWORK" });
      }
    } finally {
      if (this.controller === abort) this.controller = null;
    }
  }
  discover(): Promise<void> {
    const scope = this.snapshot.scope;
    if (scope === null) return Promise.resolve();
    return this.read(async (signal, current) => {
      const result = await discoverConditionPhotoGallery(
        this.options.transport, scope, this.snapshot, this.operationId,
        this.gallery, signal, current,
      );
      if (!result || !current()) return;
      this.operationId = result.operationId;
      this.discardSources(result.verifiedSources, result.obsolete);
      this.publish(result.snapshot);
    });
  }
  checkServer(): Promise<void> {
    const scope = this.snapshot.scope;
    if (scope === null) return Promise.resolve();
    const op = this.operationId;
    if (op === null || this.snapshot.status?.status === "VERIFIED") return this.discover();
    return this.read(async (signal, current) => {
      const value = await this.options.transport.status(scope.sessionId, op, signal);
      if (current()) this.accept(value);
    }, "unknown").then(() => {
      if (this.snapshot.scope !== null &&
        conditionPhotoScopeKey(this.snapshot.scope) === conditionPhotoScopeKey(scope) &&
        this.snapshot.status?.status === "VERIFIED" && !this.snapshot.qualifying)
        return this.discover();
    });
  }
  async reconcile(): Promise<void> {
    const scope = this.snapshot.scope;
    const status = this.snapshot.status;
    if (scope === null || status?.status !== "PENDING" ||
      status.retryAction !== "RECONCILE") return;
    await this.read(async (signal, current) => {
      const value = await this.options.transport.reconcile(
        scope.sessionId, status.operationId, signal,
      );
      if (current()) this.accept(value);
    }, "unknown");
    if (this.snapshot.scope !== null &&
      conditionPhotoScopeKey(this.snapshot.scope) === conditionPhotoScopeKey(scope) &&
      this.snapshot.status?.status === "VERIFIED" && !this.snapshot.qualifying)
      await this.discover();
  }

  upload(): Promise<void> {
    const scope = this.snapshot.scope;
    const allowSameByteResend = this.snapshot.phase === "pending" &&
      this.snapshot.status?.status === "PENDING" &&
      this.snapshot.status.retryAction === "RESEND_SAME_BYTES";
    const candidate = this.gallery.uploadCandidate(allowSameByteResend);
    const handle = candidate?.handle ?? null;
    const state = this.snapshot;
    if (this.flight || scope === null || candidate === null || handle === null ||
      (state.phase === "unknown" ||
        (state.phase === "pending" && state.status?.status === "PENDING" &&
          state.status.retryAction !== "RESEND_SAME_BYTES"))) return Promise.resolve();
    if (this.options.captureReady && !this.options.captureReady(handle)) {
      this.discardSources([handle], []);
      this.gallery.markMissingSource(candidate.slotId);
      if (this.handle === handle) this.handle = null;
      this.publish({ ...state, phase: "rejected", error: "FILE", hasCapture: false });
      return Promise.resolve();
    }
    let op: string;
    try {
      op = candidate.operationId ?? this.options.createOperationId();
    } catch {
      this.publish({ ...state, phase: "unavailable", error: "RESPONSE" });
      return Promise.resolve();
    }
    if (!this.gallery.begin(candidate.slotId, op)) {
      this.publish({ ...state, phase: "unavailable", error: "RESPONSE" });
      return Promise.resolve();
    }
    this.handle = handle;
    this.operationId = op;
    const revision = state.captureRevision;
    const key = conditionPhotoScopeKey(scope);
    const id = ++this.request;
    const abort = new AbortController();
    this.controller = abort;
    this.flight = true;
    this.publish({ ...state, phase: "uploading", error: null });
    return (async () => {
      let refresh = false;
      try {
        const value = await this.options.transport.upload(scope.sessionId, op, handle, abort.signal);
        if (this.isCurrent(id, key, revision, abort)) {
          this.accept(value);
          refresh = value.status === "VERIFIED";
        }
      } catch (error) {
        if (this.isCurrent(id, key, revision, abort)) {
          if (conditionPhotoAuthorizationLost(error)) this.clear();
          else {
            this.gallery.unknown(op);
            this.publish({ ...this.snapshot, phase: "unknown", error: "NETWORK" });
          }
        }
      } finally {
        if (this.controller === abort) this.controller = null;
        if (this.request === id) this.flight = false;
        if (refresh && this.request === id) void this.discover();
      }
    })();
  }
  private isCurrent(id: number, key: string, revision: number, abort: AbortController) {
    return this.request === id && !abort.signal.aborted &&
      this.snapshot.captureRevision === revision && this.snapshot.scope !== null &&
      conditionPhotoScopeKey(this.snapshot.scope) === key;
  }
  private accept(status: ConditionPhotoUploadStatus) {
    const scope = this.snapshot.scope;
    if (scope === null || status.valetSessionId !== scope.sessionId ||
      status.operationId !== this.operationId) return;
    const source = this.gallery.accept(status);
    if (status.status !== "PENDING") {
      if (source) this.discardSources([source], []);
      this.handle = null;
    }
    this.publish({
      ...this.snapshot, status, error: null,
      hasCapture: this.gallery.snapshot.slots.some((slot) => slot.hasCapture),
      phase: status.status === "VERIFIED" ?
        this.gallery.uploadCandidate() ? "captured" : "verified" :
        status.status === "PENDING" ? "pending" : "rejected",
      // Only current authoritative discovery can establish required eligibility.
      qualifying: this.snapshot.qualifying,
    });
  }
}
