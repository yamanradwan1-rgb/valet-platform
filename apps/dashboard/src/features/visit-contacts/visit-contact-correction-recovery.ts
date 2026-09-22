import type { VisitContactCorrectionIntent } from "./visit-contact-correction-intent";

interface RecoveryEntry {
  readonly intent: VisitContactCorrectionIntent;
  readonly scopeKey: string;
}

let recoveryEntry: RecoveryEntry | null = null;

export function stageVisitContactCorrectionRecovery(
  scopeKey: string,
  intent: VisitContactCorrectionIntent,
): void {
  recoveryEntry = { intent, scopeKey };
}

export function clearVisitContactCorrectionRecovery(scopeKey: string): void {
  if (recoveryEntry?.scopeKey === scopeKey) recoveryEntry = null;
}

export function consumeVisitContactCorrectionRecovery(
  scopeKey: string,
): VisitContactCorrectionIntent | null {
  if (recoveryEntry === null) return null;
  if (recoveryEntry.scopeKey !== scopeKey) {
    recoveryEntry = null;
    return null;
  }
  const recovered = { ...recoveryEntry.intent, reviewRequired: true };
  recoveryEntry = null;
  return recovered;
}
