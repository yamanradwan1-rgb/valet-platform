import type {
  AuditInvestigationSource,
  AuditInvestigationTimelineResponse,
} from "@valet/contracts";
import type { TimelineScopeIdentity } from "./timeline-model";

export const ORG = "11111111-1111-4111-8111-111111111111";
export const LOCATION = "22222222-2222-4222-8222-222222222222";
export const SESSION = "33333333-3333-4333-8333-333333333333";
export const MEMBER = "44444444-4444-4444-8444-444444444444";
export const SLOT = "55555555-5555-4555-8555-555555555555";
export const TASK = "66666666-6666-4666-8666-666666666666";
export const INCIDENT = "77777777-7777-4777-8777-777777777777";
export const SNAPSHOT = "2026-10-17T19:00:00.000Z";

const unavailable = { value: null, basis: "CURRENT", unavailable: true } as const;
const current = (value: string) => ({
  value,
  basis: "CURRENT" as const,
  unavailable: false,
});

export function scope(overrides: Partial<TimelineScopeIdentity> = {}): TimelineScopeIdentity {
  return {
    organizationId: ORG,
    locationId: LOCATION,
    sessionId: SESSION,
    role: "COMPANY_ADMIN",
    identityGeneration: 1,
    sessionGeneration: 3,
    selectionRevision: 1,
    ...overrides,
  };
}

export function event(
  source: AuditInvestigationSource,
  eventId: string,
  occurredAt = "2026-10-17T12:00:00.000Z",
): AuditInvestigationTimelineResponse["items"][number] {
  return {
    key: { source, eventId },
    occurredAt,
    kind: source === "INCIDENT" ? "INCIDENT_REPORTED" : "SLOT_ASSIGNED",
    quality: "RECORDED",
    actor: { membershipId: MEMBER, currentDisplayName: "Same name today" },
    participants: [],
    references: [{ kind: "SESSION", id: SESSION }],
    relatedEvidence: [],
  };
}

export const auditId = "00000000-0000-4000-8000-000000000001";
export const keyId = "00000000-0000-4000-8000-000000000002";
export const dispatchId = "00000000-0000-4000-8000-000000000003";

export function page(
  items: AuditInvestigationTimelineResponse["items"] = [],
  overrides: Partial<AuditInvestigationTimelineResponse> = {},
): AuditInvestigationTimelineResponse {
  return {
    session: {
      sessionId: SESSION,
      currentState: "PARKED",
      currentStateBasis: "CURRENT",
      currentVehicle: {
        make: current("Kia"),
        model: current("Sportage"),
        plate: unavailable,
        plateCountry: unavailable,
        temporaryDescriptor: unavailable,
      },
      currentKeySlot: { keySlotId: SLOT, code: current("K-07") },
    },
    order: "ASC",
    snapshotAt: SNAPSHOT,
    coverage: {
      AUDIT: { status: "AVAILABLE" },
      KEY_CUSTODY: { status: "AVAILABLE" },
      DISPATCH: { status: "AVAILABLE" },
      INCIDENT: { status: "AVAILABLE" },
    },
    discoveryContext: {
      from: "2026-10-17T12:00:00.000Z",
      to: "2026-10-17T13:00:00.000Z",
      matchedKeys: [{ source: "KEY_CUSTODY", eventId: keyId }],
    },
    items,
    nextCursor: null,
    ...overrides,
  };
}
