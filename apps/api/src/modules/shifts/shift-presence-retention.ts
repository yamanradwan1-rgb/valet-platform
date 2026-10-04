import { SHIFT_PRESENCE_LIMITS } from "@valet/contracts";

function time(value: Date): number {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("PRESENCE_RETENTION_TIME_INVALID");
  return milliseconds;
}

export function presenceHistoryPurgeAt(timestamp: Date): Date {
  const result = new Date(time(timestamp));
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + SHIFT_PRESENCE_LIMITS.historyMonths);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function presenceRecoveryWindow(terminalAt: Date | null, now: Date):
  "PENDING" | "RECOVERABLE" | "EXPIRED" {
  if (terminalAt === null) return "PENDING";
  const elapsed = time(now) - time(terminalAt);
  return elapsed >= 0 && elapsed < SHIFT_PRESENCE_LIMITS.reconciliationDays * 86_400_000
    ? "RECOVERABLE" : "EXPIRED";
}

export function presenceOperationPurgeEligible(terminalAt: Date | null, now: Date): boolean {
  return terminalAt !== null && time(now) >= time(terminalAt) + SHIFT_PRESENCE_LIMITS.tombstoneDays * 86_400_000;
}

export function presenceChallengePurgeEligible(expiresAt: Date, consumedAt: Date | null, now: Date): boolean {
  return consumedAt !== null ? time(now) >= time(consumedAt)
    : time(now) >= time(expiresAt) + SHIFT_PRESENCE_LIMITS.challengeCleanupHours * 3_600_000;
}
