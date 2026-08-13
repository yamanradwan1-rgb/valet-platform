import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import type { HandoffStandardMethod } from "@valet/contracts";

import { HandoffError } from "./handoff-errors";

const verifierPattern = /^hv1\.([A-Za-z0-9_-]{43})$/;

function secret(): Buffer {
  const value = process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
  if (value === undefined || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new HandoffError("HANDOFF_SECURITY_UNAVAILABLE");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    throw new HandoffError("HANDOFF_SECURITY_UNAVAILABLE");
  }
  return decoded;
}

export function generateHandoffMaterial(method: HandoffStandardMethod): string {
  return method === "PICKUP_CODE"
    ? randomInt(0, 10_000).toString().padStart(4, "0")
    : `vhq1.${randomBytes(32).toString("base64url")}`;
}

export function deriveHandoffVerifier(
  sessionId: string,
  method: HandoffStandardMethod,
  material: string,
): string {
  const digest = createHmac("sha256", secret())
    .update("handoff-verifier:v1", "utf8")
    .update(Buffer.from([0]))
    .update(method, "utf8")
    .update(Buffer.from([0]))
    .update(sessionId, "utf8")
    .update(Buffer.from([0]))
    .update(material, "utf8")
    .digest("base64url");
  return `hv1.${digest}`;
}

export function handoffMaterialMatches(
  stored: string,
  sessionId: string,
  method: HandoffStandardMethod,
  material: string,
): boolean {
  const storedMatch = verifierPattern.exec(stored);
  const candidate = deriveHandoffVerifier(sessionId, method, material);
  const candidateMatch = verifierPattern.exec(candidate);
  if (storedMatch === null || candidateMatch === null) return false;
  const storedBytes = Buffer.from(storedMatch[1] ?? "", "base64url");
  const candidateBytes = Buffer.from(candidateMatch[1] ?? "", "base64url");
  return (
    storedBytes.length === candidateBytes.length &&
    timingSafeEqual(storedBytes, candidateBytes)
  );
}
