import type {
  EndShiftResponse,
  ShiftPresenceChallengeIntent,
  ShiftPresenceEvidence,
  ShiftPresenceMeasurement,
  StartShiftResponse,
  StaffOperationalRole,
} from "@valet/contracts";
import type {
  shiftPresenceChallengeResponseSchema,
  shiftPresenceExceptionResponseSchema,
  shiftPresenceRecoveryResponseSchema,
  shiftPresenceSummarySchema,
} from "@valet/contracts";

type Parsed<T extends { parse(value: unknown): unknown }> = ReturnType<
  T["parse"]
>;
export type PresenceChallenge = Parsed<
  typeof shiftPresenceChallengeResponseSchema
>;
export type PresenceException = Parsed<
  typeof shiftPresenceExceptionResponseSchema
>;
export type PresenceRecovery = Parsed<
  typeof shiftPresenceRecoveryResponseSchema
>;
export type PresenceSummary = Parsed<typeof shiftPresenceSummarySchema>;
export type PresenceResult = StartShiftResponse | EndShiftResponse;
export type PresenceReason = PresenceException["reason"];

export interface PresenceTarget {
  readonly identityGeneration: number;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly action: "START" | "END";
  readonly shiftId: string | null;
  readonly cashReported: string | null;
  readonly shiftStartedAt?: string;
  readonly currency?: string;
  readonly role?: StaffOperationalRole;
}

export interface PresenceDescriptor {
  readonly version: 1;
  readonly operationId: string;
  readonly target: PresenceTarget;
  /** Absent only for legacy descriptors, recovered conservatively. */
  readonly stage?: "LOCAL" | "SHIFT_MAY_HAVE_LEFT" | "EXCEPTION_MAY_HAVE_LEFT";
}

export interface PresenceStore {
  write(value: PresenceDescriptor): Promise<void>;
  delete(): Promise<void>;
}

export interface PresenceAcquisition {
  acquire(
    challenge: PresenceChallenge,
    signal: AbortSignal,
  ): Promise<ShiftPresenceMeasurement>;
  openSettings(): Promise<void>;
}

export interface PresenceTransport {
  challenge(intent: ShiftPresenceChallengeIntent): Promise<PresenceChallenge>;
  readChallenge(operationId: string): Promise<PresenceChallenge>;
  recover(operationId: string): Promise<PresenceRecovery>;
  requestException(
    operationId: string,
    challengeId: string,
    reason: PresenceReason,
  ): Promise<PresenceException>;
  readException(exceptionId: string): Promise<PresenceException>;
  submit(
    target: PresenceTarget,
    operationId: string,
    presence?: ShiftPresenceEvidence,
  ): Promise<PresenceResult>;
}

export type PresencePhase =
  | "idle"
  | "discovering"
  | "acquiring"
  | "submitting"
  | "uncertain"
  | "unavailable"
  | "denied"
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "confirmed";

export interface PresenceSnapshot {
  readonly phase: PresencePhase;
  readonly mode: PresenceChallenge["presence"]["mode"] | null;
  readonly reason: string | null;
  readonly summary: PresenceSummary | null;
  readonly overrideReason: PresenceReason | null;
  readonly retryAfter: number | null;
}

export function presenceTargetKey(target: PresenceTarget): string {
  return JSON.stringify([
    target.identityGeneration,
    target.organizationId,
    target.membershipId,
    target.locationId,
    target.action,
    target.shiftId,
    target.cashReported,
    target.shiftStartedAt ?? null,
    target.currency ?? null,
  ]);
}

export function presenceIntent(
  target: PresenceTarget,
  operationId: string,
): ShiftPresenceChallengeIntent {
  return target.action === "START"
    ? { action: "START", targetLocationId: target.locationId, operationId }
    : {
        action: "END",
        shiftId: target.shiftId!,
        cashReported: target.cashReported!,
        operationId,
      };
}
