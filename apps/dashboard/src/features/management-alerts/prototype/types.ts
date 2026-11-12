export type Locale = "en" | "ar";
export type Theme = "light" | "dark";
export type Variant = "a" | "b";
export type Severity = "IMPORTANT" | "CRITICAL";
export type Kind = "ACTIVE" | "OCCURRENCE";
export type Scenario = "empty" | "one" | "multiple" | "overflow" | "loading" | "slow" | "failure" | "unavailable" | "destination-unavailable";
export type Connection = "connected" | "reconnecting" | "offline" | "revoked";
export type DemoRole = "company-admin" | "location-manager" | "unauthorized";

export const SYNTHETIC_INCIDENT_SOURCE_ID = "SIM-INC-1042" as const;
export const SYNTHETIC_INCIDENT_TARGET_ID = "SIM-TARGET-INCIDENT-1042" as const;

export type SyntheticSourceId = `SIM-${string}`;
export type SyntheticTargetId = `SIM-TARGET-${string}`;
export type SyntheticDestination =
  | {
    state: "available";
    sourceId: typeof SYNTHETIC_INCIDENT_SOURCE_ID;
    targetId: typeof SYNTHETIC_INCIDENT_TARGET_ID;
  }
  | { state: "unavailable"; sourceId: SyntheticSourceId; reason: "exact-target-unproven" }
  | {
    state: "missing";
    sourceId: SyntheticSourceId;
    targetId: SyntheticTargetId;
    reason: "synthetic-target-missing";
  }
  | {
    state: "unauthorized";
    sourceId: SyntheticSourceId;
    targetId: SyntheticTargetId;
    reason: "synthetic-target-unauthorized";
  };

export interface SyntheticAlert {
  id: string;
  category: string;
  kind: Kind;
  severity: Severity;
  title: { en: string; ar: string };
  description: { en: string; ar: string };
  location: { en: string; ar: string } | null;
  // Times exist only for explicitly synthetic committed occurrences.
  time: string | null;
  // Only time-bounded ACTIVE conditions such as ALT-12 use this field.
  expiresAt?: string | null;
  destination: SyntheticDestination;
  sourceSeverity?: "HIGH" | "CRITICAL";
  sourceStatus?: "OPEN" | "INVESTIGATING";
  sourceSubtype?: "PARKING" | "RETRIEVAL" | "TERMINAL_FAILURE" | "SUPERVISOR_OVERRIDE" |
    "RESTRICTED_ENTRY" | "LEFT_ALLOWED_UNION" | "ROLE_CHANGED" | "LOCATION_ACCESS_REVOKED";
}
