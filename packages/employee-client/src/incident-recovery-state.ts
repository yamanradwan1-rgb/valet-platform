import { incidentRecoveryProtocol } from "@valet/contracts";
import { createIncidentRecoveryId } from "./incident-recovery-id";
import {
  deleteAndConfirmIncidentRecoveryMarker,
  incidentRecoveryLocalDeadlineReached,
  parseIncidentRecoveryMarker,
  writeAndConfirmIncidentRecoveryMarker,
} from "./incident-recovery-store";
import type {
  IncidentRecoveryMarker,
  IncidentRecoveryResolution,
  IncidentRecoveryStore,
  IncidentRecoveryTransport,
} from "./incident-recovery-types";

export interface IncidentRecoveryContext {
  readonly installationGeneration: string;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
}

export type IncidentRecoveryRestore =
  | { readonly kind: "empty" }
  | { readonly kind: "invalidated" }
  | {
      readonly deadlineReached: boolean;
      readonly kind: "resolved";
      readonly marker: IncidentRecoveryMarker;
      readonly resolution: IncidentRecoveryResolution;
    }
  | { readonly kind: "storage-unavailable" };

export class IncidentRecoveryState {
  private storageTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: IncidentRecoveryStore,
    private readonly transport: IncidentRecoveryTransport,
    private readonly createId: () => string = createIncidentRecoveryId,
    private readonly now: () => number = Date.now,
  ) {}

  async prepare(
    context: IncidentRecoveryContext,
    sessionId: string,
  ): Promise<IncidentRecoveryMarker> {
    return this.serializeStorage(async () => {
      const raw = await this.store.read();
      const existing = parseIncidentRecoveryMarker(raw);
      if (raw !== null && existing === undefined) {
        throw new Error("Incident recovery storage cannot be decoded.");
      }
      if (existing !== undefined) {
        throw new Error("An Incident recovery operation is already pending.");
      }
      const marker: IncidentRecoveryMarker = {
        ...context,
        createdAt: new Date(this.now()).toISOString(),
        incidentId: this.createId(),
        protocol: incidentRecoveryProtocol,
        sessionId,
        version: 1,
      };
      await writeAndConfirmIncidentRecoveryMarker(this.store, marker);
      return marker;
    });
  }

  async reserve(marker: IncidentRecoveryMarker) {
    const result = await this.transport.reserve(marker);
    requireMatchingResolution(marker, result);
    return result;
  }

  async restore(
    context: IncidentRecoveryContext,
  ): Promise<IncidentRecoveryRestore> {
    let raw: unknown | null;
    try {
      raw = await this.serializeStorage(() => this.store.read());
    } catch {
      return { kind: "storage-unavailable" };
    }
    if (raw === null) return { kind: "empty" };
    const marker = parseIncidentRecoveryMarker(raw);
    if (marker === undefined) return { kind: "storage-unavailable" };
    if (!sameContext(marker, context)) {
      try {
        await deleteAndConfirmIncidentRecoveryMarker(this.store);
        return { kind: "invalidated" };
      } catch {
        return { kind: "storage-unavailable" };
      }
    }
    try {
      return {
        deadlineReached: incidentRecoveryLocalDeadlineReached(
          marker,
          this.now(),
        ),
        kind: "resolved",
        marker,
        resolution: requireMatchingResolution(
          marker,
          await this.transport.read(marker),
        ),
      };
    } catch {
      return {
        deadlineReached: incidentRecoveryLocalDeadlineReached(
          marker,
          this.now(),
        ),
        kind: "resolved",
        marker,
        resolution: { outcome: "UNAVAILABLE" },
      };
    }
  }

  async retire(marker: IncidentRecoveryMarker) {
    const result = await this.transport.retire(marker);
    requireMatchingResolution(marker, result);
    return result;
  }

  clearResolved(): Promise<void> {
    return this.serializeStorage(() =>
      deleteAndConfirmIncidentRecoveryMarker(this.store),
    );
  }

  purge(): Promise<void> {
    return this.serializeStorage(() =>
      deleteAndConfirmIncidentRecoveryMarker(this.store),
    );
  }

  private serializeStorage<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storageTail.then(operation, operation);
    this.storageTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function requireMatchingResolution<T extends IncidentRecoveryResolution>(
  marker: IncidentRecoveryMarker,
  resolution: T,
): T {
  if (resolution.outcome === "UNAVAILABLE") return resolution;
  if (resolution.outcome === "FOUND") {
    if (
      resolution.report.incidentId !== marker.incidentId ||
      resolution.report.sessionId !== marker.sessionId ||
      resolution.report.reportedByMembershipId !== marker.membershipId
    ) {
      throw new Error("Incident recovery response binding did not match.");
    }
    return resolution;
  }
  if (
    resolution.incidentId !== marker.incidentId ||
    resolution.sessionId !== marker.sessionId
  ) {
    throw new Error("Incident recovery response binding did not match.");
  }
  return resolution;
}

function sameContext(
  marker: IncidentRecoveryMarker,
  context: IncidentRecoveryContext,
): boolean {
  return (
    marker.installationGeneration === context.installationGeneration &&
    marker.membershipId === context.membershipId &&
    marker.organizationId === context.organizationId &&
    marker.locationId === context.locationId
  );
}
