import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../../lib/api/dashboard-api-error";
import {
  readInvestigationEventDetail,
  readInvestigationTimeline,
} from "./timeline-api";
import type {
  TimelineFailure,
  TimelineLoadState,
  TimelineScopeIdentity,
} from "./timeline-model";
import { EMPTY_TIMELINE } from "./timeline-model";
import { compareTimelineRows, projectTimelinePage, timelineRecordKey } from "./timeline-projection";

type Reader = (
  api: Pick<DashboardApiClient, "request">,
  identity: TimelineScopeIdentity,
  cursor: string | null,
  signal: AbortSignal,
) => ReturnType<typeof readInvestigationTimeline>;

function fence(identity: TimelineScopeIdentity): string {
  return [
    identity.organizationId,
    identity.locationId,
    identity.sessionId,
    identity.role,
    identity.identityGeneration,
    identity.sessionGeneration,
    identity.selectionRevision,
  ].join(":");
}

function errorKind(reason: unknown): TimelineFailure {
  if (reason instanceof DashboardApiError) {
    if (["auth", "authorization", "mfa", "entitlement"].includes(reason.kind)) {
      return "ACCESS_REVOKED";
    }
    if (reason.code.includes("CURSOR")) return "CURSOR_EXPIRED";
    if (reason.kind === "network") return "NETWORK";
    if (reason.kind === "malformed") return "MALFORMED_RESPONSE";
  }
  if (reason instanceof Error && reason.message === "TIMELINE_SOURCE_UNAVAILABLE") {
    return "UNAVAILABLE";
  }
  return "MALFORMED_RESPONSE";
}

/**
 * No React/UI side effects. The owner must call switchScope() on every identity,
 * staff-session and selected-scope change and dispose() on unmount.
 * Cancels transport AND fences already-resolved responses (even non-aborting mocks).
 */
export class InvestigationTimelineState {
  private current: TimelineLoadState = EMPTY_TIMELINE;
  private currentFence: string | null = null;
  private controller: AbortController | null = null;
  private detailController: AbortController | null = null;
  private serial = 0;
  private detailSerial = 0;
  private readonly usedCursors = new Set<string>();

  constructor(
    private readonly api: Pick<DashboardApiClient, "request">,
    private readonly read: Reader = readInvestigationTimeline,
    private readonly readDetail: typeof readInvestigationEventDetail = readInvestigationEventDetail,
  ) {}

  get state(): TimelineLoadState {
    return this.current;
  }

  private cancel() {
    this.serial += 1;
    this.controller?.abort();
    this.controller = null;
    this.detailSerial += 1;
    this.detailController?.abort();
    this.detailController = null;
  }

  switchScope(identity: TimelineScopeIdentity | null) {
    const next = identity === null ? null : fence(identity);
    if (next === this.currentFence) return;
    this.cancel();
    this.currentFence = next;
    this.usedCursors.clear();
    this.current = { ...EMPTY_TIMELINE, identity };
  }

  dispose() {
    this.cancel();
    this.currentFence = null;
    this.usedCursors.clear();
    this.current = EMPTY_TIMELINE;
  }

  start(identity: TimelineScopeIdentity): Promise<void> {
    this.switchScope(identity);
    this.cancel();
    this.usedCursors.clear();
    this.current = { ...EMPTY_TIMELINE, identity };
    return this.load(null);
  }

  next(): Promise<void> {
    if (this.current.status !== "READY" || !this.current.nextCursor) {
      return Promise.resolve();
    }
    return this.load(this.current.nextCursor);
  }

  retry(): Promise<void> {
    if (this.current.status !== "ERROR") return Promise.resolve();
    return this.load(this.current.nextCursor);
  }

  closeDetail(): void {
    this.detailSerial += 1;
    this.detailController?.abort();
    this.detailController = null;
    this.current = {
      ...this.current, detail: null, detailStatus: "IDLE", detailError: null,
    };
  }

  async openDetail(source: string, eventId: string): Promise<void> {
    const identity = this.current.identity;
    if (!identity || this.current.status !== "READY" ||
      !this.current.events.some((event) =>
        event.source === source && event.key.eventId === eventId)) return;
    this.closeDetail();
    const ticket = ++this.detailSerial;
    const abort = new AbortController();
    this.detailController = abort;
    this.current = { ...this.current, detailStatus: "LOADING" };
    try {
      const result = await this.readDetail(this.api, identity, source, eventId, abort.signal);
      if (ticket !== this.detailSerial || abort.signal.aborted) return;
      if (result.sessionId !== identity.sessionId ||
        result.source !== source || result.key.eventId !== eventId) {
        throw new Error("INVALID_DETAIL_RESPONSE");
      }
      this.current = {
        ...this.current, detail: result, detailStatus: "READY", detailError: null,
      };
    } catch (reason) {
      if (ticket !== this.detailSerial || abort.signal.aborted) return;
      const failure = errorKind(reason);
      if (failure === "ACCESS_REVOKED") {
        this.cancel();
        this.current = {
          ...EMPTY_TIMELINE, identity, status: "DENIED", error: failure,
        };
        return;
      }
      this.current = {
        ...this.current, detail: null, detailStatus: "ERROR", detailError: failure,
      };
    } finally {
      if (ticket === this.detailSerial) this.detailController = null;
    }
  }

  private async load(cursor: string | null): Promise<void> {
    const identity = this.current.identity;
    if (!identity || this.current.status === "LOADING") return;
    const ticket = ++this.serial;
    const abort = new AbortController();
    this.controller?.abort();
    this.controller = abort;
    this.current = { ...this.current, status: "LOADING", error: null };

    try {
      const raw = await this.read(this.api, identity, cursor, abort.signal);
      if (ticket !== this.serial || abort.signal.aborted) return;
      const page = projectTimelinePage(raw);
      if (page.session.sessionId !== identity.sessionId) {
        throw new Error("WRONG_TIMELINE_SESSION");
      }
      if (cursor !== null && (
        page.snapshotAt !== this.current.snapshotAt ||
        JSON.stringify(page.coverage) !== JSON.stringify(this.current.coverage) ||
        JSON.stringify(page.discoveryContext) !== JSON.stringify(this.current.discoveryContext)
      )) {
        throw new Error("TIMELINE_SNAPSHOT_CHANGED");
      }
      const prior = this.current.events;
      const seen = new Set(prior.map(timelineRecordKey));
      if (page.events.some((row) => seen.has(timelineRecordKey(row)))) {
        throw new Error("DUPLICATE_TIMELINE_RECORD");
      }
      if (prior.length && page.events.length &&
        compareTimelineRows(prior[prior.length - 1]!, page.events[0]!) >= 0) {
        throw new Error("REORDERED_TIMELINE_RECORD");
      }
      if (page.nextCursor && (
        page.nextCursor === cursor || this.usedCursors.has(page.nextCursor)
      )) {
        throw new Error("REPEATED_TIMELINE_CURSOR");
      }
      if (cursor) this.usedCursors.add(cursor);
      this.current = {
        identity,
        status: "READY",
        session: page.session,
        events: [...prior, ...page.events],
        coverage: page.coverage,
        snapshotAt: page.snapshotAt,
        discoveryContext: page.discoveryContext ?? this.current.discoveryContext,
        nextCursor: page.nextCursor,
        pageExhausted: page.nextCursor === null,
        allSourcesAvailable: page.allSourcesAvailable,
        error: null,
        detail: this.current.detail,
        detailStatus: this.current.detailStatus,
        detailError: this.current.detailError,
      };
    } catch (reason) {
      if (ticket !== this.serial || abort.signal.aborted) return;
      const failure = errorKind(reason);
      const revoke = failure === "ACCESS_REVOKED" || failure === "CURSOR_EXPIRED" ||
        failure === "MALFORMED_RESPONSE";
      this.current = {
        ...(revoke ? { ...EMPTY_TIMELINE, identity } : this.current),
        status: failure === "ACCESS_REVOKED" ? "DENIED" :
          failure === "CURSOR_EXPIRED" ? "EXPIRED" : "ERROR",
        error: failure,
        pageExhausted: false,
      };
    } finally {
      if (ticket === this.serial) this.controller = null;
    }
  }
}
