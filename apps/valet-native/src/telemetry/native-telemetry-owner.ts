/**
 * Native telemetry owner: fail-open recording + bounded memory ring
 * (MOB-024A).
 *
 * INVARIANTS:
 * - `record` NEVER throws and NEVER mutates business state. Every sink
 *   error is swallowed (fail-open telemetry).
 * - The ring is BOUNDED (max 200). Adding beyond capacity drops the OLDEST
 *   event; the buffer can never grow unbounded.
 * - Every stored event passes through the portable sanitizing factory
 *   (`createEmployeeTelemetryEvent`), so only enumerated fields with
 *   pattern-bounded requestId/errorCode can ever enter the ring.
 * - Provenance is attached HERE, by the owner, at assembly time (single
 *   documented place). The portable `EmployeeTelemetryEvent` deliberately
 *   carries no provenance; the Native snapshot adds it for support display.
 *
 * iOS portability note: this module is platform-neutral. An iOS counterpart
 * reuses this owner, this ring, and the shared vocabulary unchanged, and
 * only swaps the provenance reader (see native-telemetry-provenance.ts).
 */
import {
  createEmployeeTelemetryEvent,
  createNoopTelemetryCollector,
  failOpenTelemetryCollector,
  isSafeTelemetryRequestId,
  type EmployeeTelemetryCollector,
  type EmployeeTelemetryEvent,
  type EmployeeTelemetryProvenance,
  type IncidentPreflightStage,
} from "@valet/employee-client";

import { isNativeIncidentFailureStage } from "./native-incident-failure-stage";
import type {
  NativeTelemetryRecorder,
  NativeTelemetrySnapshot,
} from "./native-telemetry-types";

export const NATIVE_TELEMETRY_BUFFER_LIMIT = 200;

/**
 * The bounded ring buffer. It is BOTH the collector sink handed to callers
 * AND the support-facing snapshot source: anything recorded goes through
 * sanitization and lands in the ring exactly once.
 */
export class BoundedTelemetryBuffer implements EmployeeTelemetryCollector {
  private events: EmployeeTelemetryEvent[] = [];

  constructor(private readonly limit: number = NATIVE_TELEMETRY_BUFFER_LIMIT) {}

  record(event: EmployeeTelemetryEvent): void {
    const sanitized = createEmployeeTelemetryEvent(event);
    if (sanitized === undefined) return;
    this.events.push(sanitized);
    if (this.events.length > this.limit) {
      // Drop the OLDEST: keep exactly the last `limit` events.
      this.events = this.events.slice(
        Math.max(0, this.events.length - this.limit),
      );
    }
  }

  current(): readonly EmployeeTelemetryEvent[] {
    // Copy: callers must never observe later growth through a held view.
    return this.events.slice();
  }

  get size(): number {
    return this.events.length;
  }
}

/** Convenience factory: a bounded collector keeping its own ring. */
export function createBoundedMemoryCollector(
  limit: number = NATIVE_TELEMETRY_BUFFER_LIMIT,
): BoundedTelemetryBuffer {
  return new BoundedTelemetryBuffer(limit);
}

export class NativeTelemetryOwner implements NativeTelemetryRecorder {
  private readonly collector: EmployeeTelemetryCollector;
  private latestIncidentFailureStage: IncidentPreflightStage | undefined;
  /**
   * The memory ring, when the sink is one — captured BEFORE the fail-open
   * wrap (the wrapper hides the concrete type, so instanceof would fail).
   * Used only for the support-facing snapshot; never for recording.
   */
  private readonly ring: BoundedTelemetryBuffer | undefined;

  constructor(
    collector: EmployeeTelemetryCollector,
    readonly provenance: EmployeeTelemetryProvenance,
  ) {
    this.ring =
      collector instanceof BoundedTelemetryBuffer ? collector : undefined;
    // Defensive wrap: an untrusted platform collector must never break us.
    this.collector = failOpenTelemetryCollector(collector);
  }

  /** Fail-open record. Never throws, never alters the observed operation. */
  record(event: EmployeeTelemetryEvent): void {
    try {
      this.collector.record(event);
      // Only the fixed stage survives ring eviction. No incident/user/session
      // IDs, requests, descriptions, raw errors or timestamps are retained.
      if (
        this.ring !== undefined &&
        event.source === "recovery" &&
        event.classification === "preflight" &&
        event.operation === "incident-recovery"
      ) {
        if (
          event.outcome === "success" &&
          (event.errorCode === "context.success" ||
            event.errorCode === "report-response.success")
        ) {
          // A new submit begins at context.success; canonical report success
          // also invalidates any earlier pinned failure.
          this.latestIncidentFailureStage = undefined;
        } else if (
          event.outcome === "error" &&
          typeof event.errorCode === "string" &&
          event.errorCode.endsWith(".error")
        ) {
          const stage = event.errorCode.slice(0, -".error".length);
          if (
            isNativeIncidentFailureStage(stage) &&
            (this.latestIncidentFailureStage === undefined ||
              stage === "context" ||
              stage.startsWith("session-detail-"))
          )
            // Prefer the first error in one submission; a new context or
            // failed detail load is itself a new attempt boundary.
            this.latestIncidentFailureStage = stage;
        }
      }
    } catch {
      /* fail-open: telemetry is never allowed to break the caller */
    }
  }

  /** Sanitized snapshot for support diagnostics. */
  snapshot(): NativeTelemetrySnapshot {
    return {
      events: this.currentEventsSafely(),
      ...(this.latestIncidentFailureStage === undefined
        ? {}
        : { latestIncidentFailureStage: this.latestIncidentFailureStage }),
      provenance: this.provenance,
    };
  }

  /** Bounded requestId correlation helper for HTTP-style call sites. */
  withRequestId(
    requestId: string | undefined,
  ): (event: EmployeeTelemetryEvent) => void {
    const safe =
      requestId !== undefined && isSafeTelemetryRequestId(requestId)
        ? requestId
        : undefined;
    return (event: EmployeeTelemetryEvent) => {
      // An unsafe or absent id is dropped entirely — never forwarded raw.
      this.record(safe === undefined ? event : { ...event, requestId: safe });
    };
  }

  private currentEventsSafely(): readonly EmployeeTelemetryEvent[] {
    if (this.ring === undefined) return [];
    try {
      return this.ring.current();
    } catch {
      return [];
    }
  }
}

/** A recorder that discards everything, used before bootstrap wires memory. */
export function noopNativeTelemetryOwner(): NativeTelemetryOwner {
  return new NativeTelemetryOwner(
    createNoopTelemetryCollector(),
    nativeUnknownProvenance(),
  );
}

function nativeUnknownProvenance(): EmployeeTelemetryProvenance {
  return { appBuild: "unknown", appVersion: "unknown", platform: "unknown" };
}

interface NativeTelemetryRegistry {
  owner: NativeTelemetryOwner;
}

/**
 * Module-level registry. Telemetry is ambient by design (no prop-drilling
 * through screens); call sites import getNativeTelemetry() directly.
 * Pre-bootstrap it is a no-op owner so nothing can crash before wiring.
 */
let registry: NativeTelemetryRegistry | undefined;

export function installNativeTelemetry(
  owner: NativeTelemetryOwner,
): NativeTelemetryOwner {
  registry = { owner };
  return owner;
}

export function getNativeTelemetry(): NativeTelemetryOwner {
  return registry?.owner ?? noopNativeTelemetryOwner();
}

export function hasInstalledNativeTelemetry(): boolean {
  return registry !== undefined;
}

/** Test-only reset of the module registry. */
export function resetNativeTelemetryRegistryForTests(): void {
  registry = undefined;
}
