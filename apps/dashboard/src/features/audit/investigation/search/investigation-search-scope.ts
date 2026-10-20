import { auditInvestigationUuidSchema } from "@valet/contracts";

/**
 * A client-side presentation fence, not a grant of authority. The server W4
 * guard independently re-proves membership, exact Location, MFA and commercial
 * entitlement on each request and cursor continuation.
 */
export interface InvestigationSearchScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly role: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly selectionRevision: number;
}

export function validateInvestigationSearchScope(
  input: unknown,
): InvestigationSearchScope {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Investigation requires an exact, current Location scope");
  }
  const raw = input as Record<string, unknown>;
  const allowed = [
    "organizationId",
    "locationId",
    "role",
    "identityGeneration",
    "sessionGeneration",
    "selectionRevision",
  ];
  if (Object.keys(raw).some((key) => !allowed.includes(key))) {
    throw new Error("Unrecognized investigation scope field");
  }
  const organizationId = auditInvestigationUuidSchema.parse(raw.organizationId);
  const locationId = auditInvestigationUuidSchema.parse(raw.locationId);
  const role = raw.role;
  if (role !== "COMPANY_ADMIN" && role !== "LOCATION_MANAGER") {
    throw new Error("Investigation requires Company Admin or Location Manager");
  }
  for (const field of [
    "identityGeneration",
    "sessionGeneration",
    "selectionRevision",
  ]) {
    const value = raw[field];
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error(
        "Investigation scope revision must be nonnegative integer",
      );
    }
  }
  return {
    organizationId,
    locationId,
    role,
    identityGeneration: raw.identityGeneration as number,
    sessionGeneration: raw.sessionGeneration as number,
    selectionRevision: raw.selectionRevision as number,
  };
}

/** A version fence; never placed into a URL or persisted. */
export function investigationSearchScopeKey(
  scope: InvestigationSearchScope,
): string {
  return [
    scope.identityGeneration,
    scope.sessionGeneration,
    scope.selectionRevision,
    scope.role,
    scope.organizationId,
    scope.locationId,
  ].join(":");
}
