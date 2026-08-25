import { endShiftRequestSchema } from "@valet/contracts";

/** Trimmed cash entry exactly as it will be submitted (DEC-052 §7). */
export function normalizeCashEntry(raw: string): string {
  return raw.trim();
}

/**
 * Live Shift cash-entry validation. An explicitly entered zero is a valid
 * reported amount; only empty or non-numeric entry is invalid.
 */
export function isCashEntryValid(raw: string): boolean {
  return endShiftRequestSchema.safeParse({
    cashReported: normalizeCashEntry(raw),
  }).success;
}
