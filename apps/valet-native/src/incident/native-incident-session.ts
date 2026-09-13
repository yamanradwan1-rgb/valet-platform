import {
  incidentRecoveryProtocol,
  incidentRecoveryProtocolHeader,
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
  type EmployeeClient,
  type IncidentRecoveryContext,
  type IncidentRecoveryMarker,
  type IncidentRecoveryState,
} from "@valet/employee-client";
import {
  nativeIncidentPresentationError,
  NATIVE_INCIDENT_OPERATION_FAILED,
} from "./native-incident-error";
import {
  createNativeLegacyIncidentId,
  submitLegacyIncident,
} from "./native-incident-legacy-submit";
import { loadNativeIncidentDetail } from "./native-incident-load";
import { inactiveIncident as inactive } from "./native-incident-recovery-snapshot";
import {
  applyNativeIncidentRecoveryResolution,
  applyNativeIncidentRecoveryRestore,
} from "./native-incident-recovery-resolution";
import type {
  NativeIncidentSnapshot,
  NativeIncidentSubmitInput,
} from "./native-incident-types";
import type { NativeContextualTarget } from "../shell/native-contextual-route";

export class NativeIncidentSession {
  private context: IncidentRecoveryContext | null = null;
  private generation = 0;
  private marker: IncidentRecoveryMarker | null = null;
  private readonly recovery: IncidentRecoveryState | undefined;
  private legacyIncidentId: string | null = null;
  private snapshot: NativeIncidentSnapshot = inactive;
  private readonly subscribers = new Set<
    (snapshot: NativeIncidentSnapshot) => void
  >();

  constructor(
    private readonly client: () => EmployeeClient,
    recovery?: IncidentRecoveryState,
    private readonly refreshRecoveryContext: () => Promise<void> = async () => {},
    private readonly legacyId: () => string = createNativeLegacyIncidentId,
  ) {
    this.recovery = recovery;
  }

  current(): NativeIncidentSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: NativeIncidentSnapshot) => void): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  async observeRecoveryContext(
    context: IncidentRecoveryContext,
  ): Promise<void> {
    this.context = context;
    if (this.recovery === undefined) return;
    const generation = ++this.generation;
    this.publish({ ...inactive, phase: "recovery-checking" });
    const restored = await this.recovery.restore(context);
    if (generation !== this.generation) return;
    const applied = await applyNativeIncidentRecoveryRestore(
      this.recovery,
      restored,
      this.marker,
    );
    this.marker = applied.marker;
    this.publish(applied.snapshot);
  }

  async open(target: NativeContextualTarget): Promise<void> {
    if (this.marker !== null)
      return this.context === null
        ? this.fenceRecovery("recovery-unavailable")
        : this.observeRecoveryContext(this.context);
    if (this.snapshot.phase.startsWith("recovery-")) return;
    const generation = ++this.generation;
    this.legacyIncidentId = null;
    this.publish({ ...inactive, phase: "loading", target });
    await this.load(generation, target);
  }

  async retryContext(): Promise<void> {
    const target = this.snapshot.target;
    if (target === null || this.snapshot.phase !== "context-error") return;
    const generation = ++this.generation;
    this.publish({ ...this.snapshot, error: null, phase: "loading" });
    await this.load(generation, target);
  }

  async retryRecovery(): Promise<void> {
    if (this.context !== null) await this.observeRecoveryContext(this.context);
    else await this.refreshRecoveryContext();
  }

  fenceRecovery(phase: "recovery-invalidated" | "recovery-unavailable"): void {
    this.generation += 1;
    this.context = null;
    this.publish({ ...inactive, phase });
  }

  async revalidate(): Promise<void> {
    if (this.marker !== null && this.context !== null) {
      await this.observeRecoveryContext(this.context);
      return;
    }
    const target = this.snapshot.target;
    if (
      target === null ||
      this.snapshot.phase === "submitting" ||
      this.snapshot.phase === "success"
    )
      return;
    const generation = ++this.generation;
    this.publish({ ...inactive, phase: "loading", target });
    await this.load(generation, target);
  }

  async submit(input: NativeIncidentSubmitInput): Promise<boolean> {
    const current = this.snapshot;
    if (current.phase !== "form" || current.detail === null) return false;
    if (this.recovery === undefined) {
      return this.submitLegacy(current, current.detail.sessionId, input);
    }
    if (this.context === null) {
      this.publish({ ...current, phase: "recovery-unavailable" });
      return false;
    }
    const generation = this.generation;
    try {
      const validated = reportIncidentRequestSchema
        .omit({ incidentId: true })
        .parse(input);
      this.publish({ ...current, error: null, phase: "reserving" });
      const marker = await this.recovery.prepare(
        this.context,
        current.detail.sessionId,
      );
      this.marker = marker;
      if (generation !== this.generation) return false;
      await this.recovery.reserve(marker);
      if (generation !== this.generation) return false;
      this.publish({ ...current, error: null, phase: "submitting" });
      const raw = await this.client().request<unknown>({
        body: { ...validated, incidentId: marker.incidentId },
        headers: { [incidentRecoveryProtocolHeader]: incidentRecoveryProtocol },
        method: "POST",
        path: `/v1/staff/valet-sessions/${current.detail.sessionId}/incidents`,
      });
      const report = reportIncidentResponseSchema.parse(raw);
      if (generation !== this.generation) return false;
      this.publish({ ...current, error: null, phase: "success", report });
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      if (this.marker !== null) await this.observeRecoveryContext(this.context);
      else this.publishFailure(current, error);
      return false;
    }
  }

  async retire(): Promise<void> {
    if (this.marker === null || this.recovery === undefined) return;
    const generation = ++this.generation;
    this.publish({ ...this.snapshot, phase: "recovery-checking" });
    try {
      const result = await this.recovery.retire(this.marker);
      if (generation === this.generation) {
        const applied = await applyNativeIncidentRecoveryResolution(
          this.recovery,
          this.marker,
          result,
          !!this.snapshot.deadlineReached,
        );
        this.marker = applied.marker;
        this.publish(applied.snapshot);
      }
    } catch {
      if (generation === this.generation)
        this.publish({ ...this.snapshot, phase: "recovery-unavailable" });
    }
  }

  async acknowledge(): Promise<boolean> {
    if (this.marker === null || this.recovery === undefined) {
      this.publish(inactive);
      return true;
    }
    try {
      await this.recovery.clearResolved();
      this.marker = null;
      this.publish(inactive);
      return true;
    } catch {
      this.publish({ ...this.snapshot, phase: "recovery-unavailable" });
      return false;
    }
  }

  suspendForBackground(): void {
    if (this.snapshot.target === null) return;
    const busy =
      this.snapshot.phase === "submitting" ||
      this.snapshot.phase === "reserving";
    this.generation += 1;
    if (busy)
      this.publish({
        ...this.snapshot,
        error: NATIVE_INCIDENT_OPERATION_FAILED,
        phase: this.recovery === undefined ? "form" : "recovery-unavailable",
      });
  }

  clear(): void {
    this.generation += 1;
    this.legacyIncidentId = null;
    this.publish(inactive);
  }

  async purgeRecovery(): Promise<void> {
    this.generation += 1;
    this.context = null;
    try {
      await this.recovery?.purge();
      this.marker = null;
      this.publish(inactive);
    } catch (error) {
      this.publish({ ...inactive, phase: "recovery-unavailable" });
      throw error;
    }
  }

  private async submitLegacy(
    current: NativeIncidentSnapshot,
    sessionId: string,
    input: NativeIncidentSubmitInput,
  ): Promise<boolean> {
    const generation = this.generation;
    try {
      const incidentId = this.legacyIncidentId ?? this.legacyId();
      this.legacyIncidentId = incidentId;
      this.publish({ ...current, error: null, phase: "submitting" });
      const report = await submitLegacyIncident({
        client: this.client(),
        incidentId,
        sessionId,
        values: input,
      });
      if (generation !== this.generation) return false;
      this.legacyIncidentId = null;
      this.publish({ ...current, error: null, phase: "success", report });
      return true;
    } catch (error) {
      if (generation === this.generation) this.publishFailure(current, error);
      return false;
    }
  }

  private publishFailure(base: NativeIncidentSnapshot, error: unknown): void {
    this.publish({
      ...base,
      error: nativeIncidentPresentationError(error),
      phase: "form",
    });
  }

  private async load(
    generation: number,
    target: NativeContextualTarget,
  ): Promise<void> {
    try {
      const detail = await loadNativeIncidentDetail(
        this.client(),
        target.sessionId,
      );
      if (generation !== this.generation || this.snapshot.target !== target)
        return;
      if (detail.state === "COMPLETED") throw new Error("terminal");
      this.publish({ ...inactive, detail, phase: "form", target });
    } catch {
      if (generation === this.generation && this.snapshot.target === target)
        this.publish({ ...inactive, phase: "context-error", target });
    }
  }

  private publish(snapshot: NativeIncidentSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.subscribers) listener(snapshot);
  }
}
