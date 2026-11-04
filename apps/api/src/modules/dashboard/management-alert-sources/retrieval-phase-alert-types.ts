import type { ManagementAlertReaderInput } from "./management-alert-source-contract";
import { requireManagementAlertClockCutover } from "../management-alert-clock-cutover";

/** Release-gated from a DB-side millisecond clock after all old writers stop. */
export interface RetrievalPhaseAlertInput extends ManagementAlertReaderInput {
  readonly delaySeconds: number;
  readonly alt01GraceSeconds?: number;
  readonly postLockClockCutover: Date;
}

export interface RetrievalPhaseAlertCase {
  readonly category: "ALT-04" | "ALT-06";
  readonly severity: "IMPORTANT";
  readonly sourceKind: "TASK" | "RETRIEVAL";
  readonly sourceId: string;
  readonly episodeId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly occurredAt: string;
  readonly title: string;
}

/** Direct readers must prove their supplied cutover against trusted server
 * release configuration. A finite Date or caller claim alone is NOT proof. */
export function validateRetrievalPhaseAlertInput(
  input: RetrievalPhaseAlertInput,
): void {
  if (
    !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 21 ||
    !Number.isSafeInteger(input.delaySeconds) ||
    input.delaySeconds < 60 || input.delaySeconds > 900 ||
    (input.alt01GraceSeconds !== undefined &&
      (!Number.isSafeInteger(input.alt01GraceSeconds) ||
        input.alt01GraceSeconds < 0 || input.alt01GraceSeconds > 60)) ||
    !(input.postLockClockCutover instanceof Date) ||
    !Number.isFinite(input.postLockClockCutover.getTime())
  ) {
    throw new RangeError("Unproven or unbounded retrieval phase source clock.");
  }
  // Fail closed if the post-quiescence server release gate is absent, invalid,
  // or not the *exact* millisecond cutover passed by the management facade.
  if (input.postLockClockCutover.getTime() !==
    requireManagementAlertClockCutover().getTime()) {
    throw new RangeError("Unproven retrieval phase source-clock cutover.");
  }
}
