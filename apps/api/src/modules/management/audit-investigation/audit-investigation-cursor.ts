import { createHmac, timingSafeEqual } from "node:crypto";

import {
  auditInvestigationCursorPayloadSchema,
  auditInvestigationReadScopeSchema,
  type AuditInvestigationCursorPayload,
  type AuditInvestigationReadScope,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../../common/http/api-errors";
import type { StaffSessionContext } from "../../auth/staff-session-context";
import {
  decodeSignedManagementCursor,
  encodeSignedManagementCursor,
} from "../management-pagination-snapshot";

type Purpose = AuditInvestigationCursorPayload["purpose"];

export interface InvestigationCursorBinding {
  readonly purpose: Purpose;
  readonly organizationId: string;
  readonly locationId: string;
  readonly viewerSessionDigest: string;
  readonly filterDigest: string;
  readonly sessionId?: string;
}

/** Derives a purpose-bound digest, never containing a searchable raw plate or
 * an access token. The existing signed Management cursor remains the envelope.
 */
function signingKey(): Buffer {
  const encoded = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error("Management cursor secret is not configured.");
  }
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== encoded) {
    throw new Error("Management cursor secret is invalid.");
  }
  return key;
}

function digest(domain: string, data: string): string {
  return createHmac("sha256", signingKey())
    .update(`audit-investigation:v1:${domain}\0`, "utf8")
    .update(data, "utf8")
    .digest("hex");
}

/** Canonical JSON for already validated filters; preserves array ordering.
 * Do not pass a cursor or authority claims in normalizedFilters.
 */
function canonicalJson(value: unknown): string {
  const visited = new Set<object>();
  function visit(next: unknown): unknown {
    if (next === null || typeof next === "string" || typeof next === "boolean") return next;
    if (typeof next === "number" && Number.isFinite(next)) return next;
    if (typeof next !== "object") throw new ApiTransportValidationError();
    if (visited.has(next)) throw new ApiTransportValidationError();
    visited.add(next);
    if (Array.isArray(next)) return next.map(visit);
    if (Object.getPrototypeOf(next) !== Object.prototype) throw new ApiTransportValidationError();
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(next).sort()) {
      if (key === "cursor" || key === "__proto__" || key === "constructor") {
        throw new ApiTransportValidationError();
      }
      result[key] = visit((next as Record<string, unknown>)[key]);
    }
    return result;
  }
  const encoded = JSON.stringify(visit(value));
  if (encoded.length > 4096) throw new ApiTransportValidationError();
  return encoded;
}

export function bindInvestigationCursor(input: {
  readonly scope: AuditInvestigationReadScope;
  readonly context: StaffSessionContext;
  readonly normalizedFilters: unknown;
  readonly purpose: Purpose;
  readonly sessionId?: string;
}): InvestigationCursorBinding {
  const scope = auditInvestigationReadScopeSchema.parse(input.scope);
  if (input.purpose === "SESSION_TIMELINE" && !input.sessionId) {
    throw new ApiTransportValidationError();
  }
  const context = input.context;
  return {
    purpose: input.purpose,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    viewerSessionDigest: digest("viewer", [
      context.userId, context.staffAuthSessionId, scope.membershipId, scope.role,
    ].join("\0")),
    filterDigest: digest("filters", canonicalJson({
      purpose: input.purpose,
      sessionId: input.sessionId ?? null,
      filters: input.normalizedFilters,
    })),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  };
}

function sameString(a: string, b: string): boolean {
  const first = Buffer.from(a, "utf8");
  const second = Buffer.from(b, "utf8");
  return first.length === second.length && timingSafeEqual(first, second);
}

/** A signed cursor is NOT authority. Every call must run W4 current-access
 * checks before reading, even when this cursor verifies successfully.
 */
function checked(
  candidate: unknown,
  binding: InvestigationCursorBinding,
  now: Date,
): AuditInvestigationCursorPayload {
  const parsed = auditInvestigationCursorPayloadSchema.safeParse(candidate);
  if (!parsed.success) throw new ApiTransportValidationError();
  const data = parsed.data;
  if (
    data.purpose !== binding.purpose ||
    data.organizationId !== binding.organizationId ||
    data.locationId !== binding.locationId ||
    !sameString(data.viewerSessionDigest, binding.viewerSessionDigest) ||
    !sameString(data.filterDigest, binding.filterDigest) ||
    (data.purpose === "SESSION_TIMELINE" && data.sessionId !== binding.sessionId) ||
    Date.parse(data.issuedAt) > now.getTime() + 30_000 ||
    Date.parse(data.expiresAt) <= now.getTime()
  ) {
    throw new ApiTransportValidationError();
  }
  return data;
}

export function encodeInvestigationCursor(
  binding: InvestigationCursorBinding,
  payload: AuditInvestigationCursorPayload,
  now = new Date(),
): string {
  const checkedPayload = checked(payload, binding, now);
  return encodeSignedManagementCursor(checkedPayload);
}

export function decodeInvestigationCursor(
  encoded: string | undefined,
  binding: InvestigationCursorBinding,
  now = new Date(),
): AuditInvestigationCursorPayload | null {
  if (encoded === undefined) return null;
  try {
    return checked(decodeSignedManagementCursor(encoded), binding, now);
  } catch {
    throw new ApiTransportValidationError();
  }
}
