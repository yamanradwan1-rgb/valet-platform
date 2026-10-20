import { createHmac, timingSafeEqual } from "node:crypto";

import { auditInvestigationUuidSchema } from "@valet/contracts";
import { ApiTransportValidationError } from "../../../../common/http/api-errors";
import type { StaffSessionContext } from "../../../auth/staff-session-context";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";

/** Member selectors use a CURRENT-directory UUID keyset, NOT the immutable
 * four-source evidence snapshot. Never reuse these cursors for Investigation.
 */
interface BoundSelector {
  readonly scope: AuditInvestigationLocationAuthorization;
  readonly context: StaffSessionContext;
  readonly text: string | undefined;
}

function key(): Buffer {
  const encoded = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded))
    throw new Error("Member selector signing key not configured");
  const secret = Buffer.from(encoded, "base64url");
  if (secret.length !== 32 || secret.toString("base64url") !== encoded)
    throw new Error("Member selector signing key invalid");
  return secret;
}

function mac(secret: Buffer, domain: string, value: string): Buffer {
  return createHmac("sha256", secret)
    .update("issue300-member-selector:v1:" + domain + "\0")
    .update(value).digest();
}

function binding(input: BoundSelector, secret: Buffer) {
  const { scope, context } = input;
  return {
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    viewer: mac(secret, "viewer", [context.userId,
      context.staffAuthSessionId, scope.membershipId, scope.role].join("\0")).toString("hex"),
    filter: mac(secret, "filter", (input.text ?? "").trim().toLowerCase())
      .toString("hex"),
  };
}

export function encodeMemberSelectorCursor(input: BoundSelector, lastId: string,
  now = Date.now()): string {
  const validatedId = auditInvestigationUuidSchema.parse(lastId);
  const secret = key();
  const payload = JSON.stringify({ version: 1, purpose: "MEMBER_SELECTOR",
    ...binding(input, secret), lastId: validatedId,
    issuedAt: now, expiresAt: now + 5 * 60_000 });
  const bytes = Buffer.from(payload, "utf8");
  return bytes.toString("base64url") + mac(secret, "signature", payload).toString("base64url");
}

/** Decode AFTER current W4 Location/MFA/commercial reauthorization. */
export function decodeMemberSelectorCursor(input: BoundSelector, cursor: string,
  now = Date.now()): string {
  if (!/^[A-Za-z0-9_-]{44,4096}$/.test(cursor))
    throw new ApiTransportValidationError();
  const content = cursor.slice(0, -43);
  const signature = cursor.slice(-43);
  try {
    const encoded = Buffer.from(content, "base64url");
    if (encoded.toString("base64url") !== content || encoded.length > 3000)
      throw new Error("noncanonical cursor");
    const raw = encoded.toString("utf8");
    const secret = key();
    const expected = mac(secret, "signature", raw);
    const given = Buffer.from(signature, "base64url");
    if (given.toString("base64url") !== signature ||
        given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new Error("signature mismatch");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("invalid cursor payload");
    const payload = value as Record<string, unknown>;
    const bound = binding(input, secret);
    if (Object.keys(payload).sort().join(",") !==
        ["expiresAt", "filter", "issuedAt", "lastId", "locationId",
          "organizationId", "purpose", "version", "viewer"].sort().join(",") ||
        payload.version !== 1 || payload.purpose !== "MEMBER_SELECTOR" ||
        payload.organizationId !== bound.organizationId ||
        payload.locationId !== bound.locationId ||
        payload.viewer !== bound.viewer || payload.filter !== bound.filter ||
        typeof payload.issuedAt !== "number" ||
        typeof payload.expiresAt !== "number" ||
        payload.issuedAt > now + 30_000 || payload.expiresAt <= now ||
        payload.expiresAt - payload.issuedAt > 5 * 60_000 ||
        !auditInvestigationUuidSchema.safeParse(payload.lastId).success) {
      throw new Error("cursor binding invalid");
    }
    return payload.lastId as string;
  } catch {
    throw new ApiTransportValidationError();
  }
}
