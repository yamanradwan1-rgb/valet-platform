import { createHmac, timingSafeEqual } from "node:crypto";

const signatureFormat = /^sha256=([0-9a-f]{64})$/;
export const MAX_META_WEBHOOK_BYTES = 256 * 1024;

/** Never parse or trust webhook JSON before checking the exact original bytes. */
export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string | undefined,
): boolean {
  if (!Buffer.isBuffer(rawBody) || rawBody.length > MAX_META_WEBHOOK_BYTES)
    return false;
  if (!appSecret || appSecret.length < 16 || !header) return false;
  const match = signatureFormat.exec(header);
  if (!match) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const submitted = Buffer.from(match[1]!, "hex");
  return submitted.length === expected.length && timingSafeEqual(submitted, expected);
}

export function verifyMetaSubscription(
  mode: unknown,
  token: unknown,
  challenge: unknown,
  expectedToken: string | undefined,
): string | null {
  if (mode !== "subscribe" || typeof token !== "string" ||
      !expectedToken || expectedToken.length < 16) return null;
  const submitted = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  if (submitted.length !== expected.length ||
      !timingSafeEqual(submitted, expected)) return null;
  return typeof challenge === "string" && /^[0-9]{1,40}$/.test(challenge)
    ? challenge : null;
}
