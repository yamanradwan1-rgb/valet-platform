export type SafeAuditMetadataValue = boolean | number | string | null;
export type SafeOrganizationAuditMetadata = Readonly<
  Record<string, SafeAuditMetadataValue>
>;

export type TenantAuditActor =
  | { readonly type: "MEMBERSHIP"; readonly membershipId: string }
  | { readonly type: "GUEST" }
  | { readonly type: "SYSTEM" }
  | { readonly type: "EXTERNAL_PROVIDER" }
  | { readonly type: "CONTROLLED_OPERATOR"; readonly operatorRef: string };

export type AccountSecurityAuditActor =
  | { readonly type: "USER"; readonly userId: string }
  | { readonly type: "CONTROLLED_OPERATOR"; readonly operatorRef: string }
  | { readonly type: "SYSTEM" }
  | { readonly type: "ANONYMOUS" };

export type RuntimeAccountSecurityAuditActor = Exclude<
  AccountSecurityAuditActor,
  { readonly type: "CONTROLLED_OPERATOR" }
>;

export type OrganizationAuditActor = Exclude<
  TenantAuditActor,
  { readonly type: "CONTROLLED_OPERATOR" }
>;

export class UnsafeAuditEventError extends Error {
  readonly code = "UNSAFE_AUDIT_EVENT" as const;

  constructor() {
    super("Audit event contains unsafe or invalid facts.");
    this.name = "UnsafeAuditEventError";
  }
}

export class AuditEventIdentityConflictError extends Error {
  readonly code = "AUDIT_EVENT_IDENTITY_CONFLICT" as const;

  constructor() {
    super("Audit event identity was already used with different facts.");
    this.name = "AuditEventIdentityConflictError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[A-Za-z][A-Za-z0-9_]*$/;
const eventTypePattern = /^[A-Z][A-Z0-9_]*$/;
const controlCharacterPattern = /\p{Cc}/u;
const prohibitedMetadataKeyPattern =
  /(address|authorization|bearer|contact|coordinate|credential|cvv|email|gps|latitude|longitude|mfa|otp|pan|password|phone|pickup.?code|recovery.?code|request.?body|secret|security.?code|seed|token|verifier)/i;
const prohibitedExactMetadataKeys = new Set(["lat", "lng", "lon"]);

function isProhibitedMetadataKey(key: string): boolean {
  return (
    prohibitedMetadataKeyPattern.test(key) ||
    prohibitedExactMetadataKeys.has(key.toLowerCase())
  );
}

export function requireAuditUuid(value: string): void {
  if (!uuidPattern.test(value)) throw new UnsafeAuditEventError();
}

export function requireAuditEventType(value: string): void {
  if (
    value.length === 0 ||
    value.length > 100 ||
    !eventTypePattern.test(value)
  ) {
    throw new UnsafeAuditEventError();
  }
}

export function requireAuditEntityType(value: string): void {
  if (
    value.length === 0 ||
    value.length > 100 ||
    !identifierPattern.test(value)
  ) {
    throw new UnsafeAuditEventError();
  }
}

export function requireOperatorRef(value: string): void {
  if (
    value.length === 0 ||
    Array.from(value).length > 200 ||
    controlCharacterPattern.test(value)
  ) {
    throw new UnsafeAuditEventError();
  }
}

export function validateTenantAuditActor(actor: TenantAuditActor): void {
  if (actor.type === "MEMBERSHIP") requireAuditUuid(actor.membershipId);
  if (actor.type === "CONTROLLED_OPERATOR") requireOperatorRef(actor.operatorRef);
}

export function validateAccountSecurityActor(
  actor: AccountSecurityAuditActor,
): void {
  if (actor.type === "USER") requireAuditUuid(actor.userId);
  if (actor.type === "CONTROLLED_OPERATOR") requireOperatorRef(actor.operatorRef);
}

export function validateOrganizationAuditMetadata(
  metadata: SafeOrganizationAuditMetadata,
  allowedMetadataKeys: readonly string[],
): void {
  const keys = Object.keys(metadata);
  if (
    keys.length > 16 ||
    allowedMetadataKeys.length > 16 ||
    new Set(allowedMetadataKeys).size !== allowedMetadataKeys.length
  ) {
    throw new UnsafeAuditEventError();
  }
  for (const key of allowedMetadataKeys) {
    if (
      key.length === 0 ||
      key.length > 64 ||
      !identifierPattern.test(key) ||
      isProhibitedMetadataKey(key)
    ) {
      throw new UnsafeAuditEventError();
    }
  }
  const allowed = new Set(allowedMetadataKeys);
  for (const key of keys) {
    if (
      key.length === 0 ||
      key.length > 64 ||
      !identifierPattern.test(key) ||
      !allowed.has(key) ||
      isProhibitedMetadataKey(key)
    ) {
      throw new UnsafeAuditEventError();
    }
    const value = metadata[key];
    if (
      value !== null &&
      typeof value !== "boolean" &&
      typeof value !== "number" &&
      typeof value !== "string"
    ) {
      throw new UnsafeAuditEventError();
    }
    if (
      typeof value === "string" &&
      (Array.from(value).length > 500 || controlCharacterPattern.test(value))
    ) {
      throw new UnsafeAuditEventError();
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new UnsafeAuditEventError();
    }
  }
}
