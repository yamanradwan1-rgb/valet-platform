import { operationalFailure } from "./employee-operational-recovery";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import {
  applyMarkReadyResult,
  applyStartRetrievalResult,
} from "./employee-retrieval-flow-command";
import {
  classifyRetrievalFailure,
  emptyRetrievalSnapshot,
  isRetrievalSubmitting,
  isRetrievalTargetCurrent,
  loadRetrievalCanonical,
  retrievalKeyCandidateMatches,
  retrievalReadFailurePhase,
  retrievalScannedKeyInput,
  retrievalV2ScanAccepted,
  withRetrievalKeyCandidate,
  type EmployeeRetrievalTarget as Target,
} from "./employee-retrieval-flow-state";
import { parseResourceQr, type QrResourcePayload } from "./qr-resource-payload";
import type {
  EmployeeRetrievalOptions,
  EmployeeRetrievalSnapshot,
} from "./employee-retrieval-flow-types";

export class EmployeeRetrievalSession {
  private activeCommand: Promise<void> | undefined;
  private activeRead: Promise<void> | undefined;
  private request = 0;
  private snapshot = emptyRetrievalSnapshot();
  private readonly subscribers = new Set<
    (snapshot: EmployeeRetrievalSnapshot) => void
  >();
  private target: Target | null = null;

  constructor(private readonly options: EmployeeRetrievalOptions) {}
  current = () => this.snapshot;
  subscribe(listener: (snapshot: EmployeeRetrievalSnapshot) => void) {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }
  openQueueTask(
    identityGeneration: number,
    scope: EmployeeOperationalScope,
    taskId: string,
    sessionId: string,
  ): Promise<void> {
    this.bind(identityGeneration, scope, taskId, sessionId);
    return this.reconcile("loading");
  }
  checkServerState(): Promise<void> {
    if (this.target === null || isRetrievalSubmitting(this.snapshot.phase)) {
      return this.activeCommand ?? Promise.resolve();
    }
    return this.reconcile(
      this.snapshot.phase === "ambiguous" ? "reconciling" : "loading",
    );
  }

  suspendForBackground(): void {
    if (this.target === null) return;
    const protectedOutcome = this.activeCommand !== undefined;
    this.fenceActiveWork();
    if (protectedOutcome)
      this.publish({ ...this.snapshot, failure: null, phase: "ambiguous" });
  }

  enterKeySlot(candidate: string): void {
    if (this.snapshot.phase !== "key-checkout" || this.snapshot.session === null) return;
    this.publish(withRetrievalKeyCandidate(this.snapshot, candidate, null));
  }

  scanKeySlot(payload: unknown): boolean {
    const parsed = parseResourceQr(payload, "key-slot");
    return parsed.ok ? this.acceptKeySlotScan(parsed.payload) : false;
  }

  acceptKeySlotScan(candidate: QrResourcePayload): boolean {
    if (!retrievalV2ScanAccepted(this.snapshot, candidate)) return false;
    this.publish(
      withRetrievalKeyCandidate(
        this.snapshot,
        candidate.resourceCode,
        candidate.resourceId,
      ),
    );
    return true;
  }

  confirmKeySlot(): boolean {
    if (this.snapshot.phase !== "key-checkout" || this.snapshot.session === null) return false;
    const matches = retrievalKeyCandidateMatches(this.snapshot);
    this.publish({ ...this.snapshot, keyConfirmed: matches });
    return matches;
  }

  startRetrieval(): Promise<void> {
    if (this.activeCommand !== undefined) return this.activeCommand;
    const target = this.target;
    const task = this.snapshot.task;
    const session = this.snapshot.session;
    if (
      target === null ||
      task === null ||
      session === null ||
      this.snapshot.phase !== "key-checkout" ||
      !this.snapshot.keyConfirmed
    ) {
      return Promise.resolve();
    }
    const request = ++this.request;
    this.publish({
      ...this.snapshot,
      failure: null,
      phase: "submitting-start",
    });
    const operation = this.executeStart(target, task, session, request).finally(
      () => {
        if (this.activeCommand === operation) this.activeCommand = undefined;
      },
    );
    this.activeCommand = operation;
    return operation;
  }

  markReady(): Promise<void> {
    if (this.activeCommand !== undefined) return this.activeCommand;
    const target = this.target;
    const session = this.snapshot.session;
    const task = this.snapshot.task;
    if (
      target === null ||
      session === null ||
      task === null ||
      this.snapshot.phase !== "retrieving"
    ) {
      return Promise.resolve();
    }
    const request = ++this.request;
    this.publish({
      ...this.snapshot,
      failure: null,
      phase: "submitting-ready",
    });
    const operation = this.executeReady(target, task, session, request).finally(
      () => {
        if (this.activeCommand === operation) this.activeCommand = undefined;
      },
    );
    this.activeCommand = operation;
    return operation;
  }

  clear(): void {
    this.fenceActiveWork();
    this.target = null;
    this.publish(emptyRetrievalSnapshot());
  }

  private bind(
    identityGeneration: number,
    scope: EmployeeOperationalScope,
    taskId: string,
    sessionId: string,
  ): void {
    this.fenceActiveWork();
    this.target = {
      identityGeneration,
      locationId: scope.locationId,
      membershipId: scope.membershipId,
      organizationId: scope.organizationId,
      sessionId,
      shiftId: scope.shiftId,
      taskId,
    };
    this.publish(emptyRetrievalSnapshot(identityGeneration, scope, "loading"));
  }

  private reconcile(phase: "loading" | "reconciling"): Promise<void> {
    if (this.activeRead !== undefined) return this.activeRead;
    const target = this.target;
    if (target === null) return Promise.resolve();
    const request = ++this.request;
    const previous = this.snapshot.phase;
    this.publish({ ...this.snapshot, failure: null, phase });
    const operation = this.executeRead(target, request, previous).finally(
      () => {
        if (this.activeRead === operation) this.activeRead = undefined;
      },
    );
    this.activeRead = operation;
    return operation;
  }

  private async executeRead(
    target: Target,
    request: number,
    previous: EmployeeRetrievalSnapshot["phase"],
  ): Promise<void> {
    try {
      const next = await loadRetrievalCanonical(
        this.options.transport,
        this.snapshot,
        target,
        previous,
      );
      if (!this.isCurrent(target, request)) return;
      if (next.task !== null) target.taskId = next.task.taskId;
      this.publish(next);
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      this.publish({
        ...this.snapshot,
        failure: operationalFailure(error),
        phase: retrievalReadFailurePhase(previous),
      });
    }
  }

  private async executeStart(
    target: Target,
    task: NonNullable<EmployeeRetrievalSnapshot["task"]>,
    session: NonNullable<EmployeeRetrievalSnapshot["session"]>,
    request: number,
  ): Promise<void> {
    try {
      const result = await this.options.transport.startRetrieval(
        session.sessionId,
        session.version,
        task.version,
        retrievalScannedKeyInput(this.snapshot),
      );
      if (!this.isCurrent(target, request)) return;
      this.publish(
        applyStartRetrievalResult(this.snapshot, session, task, result),
      );
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      const kind = classifyRetrievalFailure(error);
      this.publish({
        ...this.snapshot,
        failure: operationalFailure(error),
        phase: kind === "ambiguous" ? "ambiguous" : kind,
      });
      if (kind === "ambiguous" || kind === "conflict") {
        await this.reconcile("reconciling");
      }
    }
  }

  private async executeReady(
    target: Target,
    task: NonNullable<EmployeeRetrievalSnapshot["task"]>,
    session: NonNullable<EmployeeRetrievalSnapshot["session"]>,
    request: number,
  ): Promise<void> {
    try {
      const result = await this.options.transport.markReady(
        session.sessionId,
        session.version,
      );
      if (!this.isCurrent(target, request)) return;
      this.publish(applyMarkReadyResult(this.snapshot, session, task, result));
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      const kind = classifyRetrievalFailure(error);
      this.publish({
        ...this.snapshot,
        failure: operationalFailure(error),
        phase: kind === "ambiguous" ? "ambiguous" : kind,
      });
      if (kind === "ambiguous" || kind === "conflict") {
        await this.reconcile("reconciling");
      }
    }
  }

  private isCurrent(target: Target, request?: number): boolean {
    return (
      this.target === target &&
      isRetrievalTargetCurrent(this.snapshot, target) &&
      (request === undefined || request === this.request)
    );
  }

  private fenceActiveWork(): void {
    this.request += 1;
    this.activeCommand = undefined;
    this.activeRead = undefined;
  }

  private publish(snapshot: EmployeeRetrievalSnapshot): void {
    this.snapshot = snapshot;
    this.options.onStateChange?.(snapshot);
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}
