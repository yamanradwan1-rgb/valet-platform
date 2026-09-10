import {
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
  staffValetSessionDetailResponseSchema,
  EmployeeApiError,
  type EmployeeClient,
} from "@valet/employee-client";
import { NATIVE_INCIDENT_OPERATION_FAILED } from "./native-incident-error";

import type {
  NativeIncidentSnapshot,
  NativeIncidentSubmitInput,
} from "./native-incident-types";
import type { NativeContextualTarget } from "../shell/native-contextual-route";

const inactive: NativeIncidentSnapshot = {
  detail: null,
  error: null,
  phase: "inactive",
  report: null,
  target: null,
};

export class NativeIncidentSession {
  private generation = 0;
  private incidentId: string | null = null;
  private snapshot: NativeIncidentSnapshot = inactive;
  private readonly subscribers = new Set<
    (snapshot: NativeIncidentSnapshot) => void
  >();

  constructor(
    private readonly client: () => EmployeeClient,
    private readonly createIncidentId: () => string = secureIncidentId,
  ) {}

  current(): NativeIncidentSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: NativeIncidentSnapshot) => void): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  async open(target: NativeContextualTarget): Promise<void> {
    this.generation += 1;
    this.incidentId = null;
    this.publish({ ...inactive, phase: "loading", target });
    await this.load(this.generation, target);
  }

  async retryContext(): Promise<void> {
    const target = this.snapshot.target;
    if (target === null || this.snapshot.phase !== "context-error") return;
    this.generation += 1;
    this.publish({ ...this.snapshot, error: null, phase: "loading" });
    await this.load(this.generation, target);
  }

  async submit(input: NativeIncidentSubmitInput): Promise<boolean> {
    const current = this.snapshot;
    if (current.phase !== "form" || current.detail === null) return false;
    const generation = this.generation;
    let incidentId: string;
    try {
      incidentId = this.incidentId ?? this.createIncidentId();
      this.incidentId = incidentId;
    } catch (error: unknown) {
      this.publish({
        ...current,
        error: nativeIncidentPresentationError(error),
      });
      return false;
    }
    this.publish({ ...current, error: null, phase: "submitting" });
    try {
      const body = reportIncidentRequestSchema.parse({ ...input, incidentId });
      const raw = await this.client().request<unknown>({
        body,
        method: "POST",
        path: `/v1/staff/valet-sessions/${current.detail.sessionId}/incidents`,
      });
      const report = reportIncidentResponseSchema.parse(raw);
      if (generation !== this.generation) return false;
      this.incidentId = null;
      this.publish({ ...current, error: null, phase: "success", report });
      return true;
    } catch (error: unknown) {
      if (generation === this.generation) {
        this.publish({
          ...current,
          error: nativeIncidentPresentationError(error),
          phase: "form",
        });
      }
      return false;
    }
  }

  clear(): void {
    this.generation += 1;
    this.incidentId = null;
    this.publish(inactive);
  }

  private async load(
    generation: number,
    target: NativeContextualTarget,
  ): Promise<void> {
    try {
      const raw = await this.client().request<unknown>({
        method: "GET",
        path: `/v1/staff/valet-sessions/${target.sessionId}`,
      });
      const detail = staffValetSessionDetailResponseSchema.parse(raw);
      if (generation !== this.generation) return;
      if (detail.state === "COMPLETED") throw new Error("terminal");
      this.publish({
        detail,
        error: null,
        phase: "form",
        report: null,
        target,
      });
    } catch {
      if (generation === this.generation) {
        this.publish({ ...inactive, phase: "context-error", target });
      }
    }
  }

  private publish(snapshot: NativeIncidentSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.subscribers) listener(snapshot);
  }
}

function secureIncidentId(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (value === undefined) {
    throw new Error(
      "Secure UUID generation is unavailable; incident cannot be submitted.",
    );
  }
  return value;
}

function nativeIncidentPresentationError(error: unknown): string {
  if (error instanceof EmployeeApiError && error.message.trim().length > 0) {
    return error.message;
  }
  return NATIVE_INCIDENT_OPERATION_FAILED;
}
