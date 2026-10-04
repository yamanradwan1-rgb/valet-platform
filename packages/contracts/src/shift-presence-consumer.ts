import { shiftPresenceSummarySchema } from "./shift-presence-public.js";
import type {
  ShiftPresenceClassification,
  ShiftPresenceReason,
} from "./shift-presence.js";

/** Only maps authoritative safe summaries; never classifies a client fix or grants approval. */
export function shiftPresenceMeasuredDenialExceptionReason(summary: {
  readonly classification: ShiftPresenceClassification;
  readonly reason: ShiftPresenceReason;
}): "OUTSIDE_ZONE" | "AMBIGUOUS_FIX" | "GPS_UNAVAILABLE" | null {
  const parsed = shiftPresenceSummarySchema.parse(summary);
  switch (parsed.classification) {
    case "CONFIDENT_OUTSIDE":
      return "OUTSIDE_ZONE";
    case "AMBIGUOUS_EDGE":
      return "AMBIGUOUS_FIX";
    case "MEASUREMENT_UNUSABLE":
      return "GPS_UNAVAILABLE";
    default:
      return null;
  }
}
