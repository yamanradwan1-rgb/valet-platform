import type { OutboundSendResult } from "../contracts/outbound-provider.js";

const rateLimitCodes = new Set([130429, 80007]);
const recipientCodes = new Set([131026]);
const templateCodes = new Set([132000, 132001, 132012, 132015, 132016]);
const authCodes = new Set([190, 10, 200]);
const policyCodes = new Set([131047, 131048]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function retryAfterSeconds(headerValue: string | null): number | undefined {
  if (!headerValue || !/^[0-9]{1,4}$/.test(headerValue)) return undefined;
  const seconds = Number(headerValue);
  return seconds > 0 && seconds <= 600 ? seconds : undefined;
}

/** Transport success proves Meta accepted a request for processing, not delivery. */
export function classifyMetaReply(status: number, body: unknown, retryAfter: string | null): OutboundSendResult {
  const json = record(body);
  if (status >= 200 && status < 300) {
    const messages = json?.messages;
    const first = Array.isArray(messages) && messages.length === 1 ? record(messages[0]) : null;
    const id = first?.id;
    if (json?.messaging_product === "whatsapp" && typeof id === "string" &&
        /^wamid\.[A-Za-z0-9._:-]{1,250}$/.test(id)) {
      return { kind: "ACCEPTED", providerMessageId: id };
    }
    return { kind: "UNKNOWN", reason: "MALFORMED_RESPONSE" };
  }

  // Only verified, exact error codes prove definite nonacceptance. HTTP status alone never does.
  const error = record(json?.error);
  const code = error?.code;
  if (typeof code !== "number" || !Number.isSafeInteger(code))
    return { kind: "UNKNOWN", reason: "MALFORMED_RESPONSE" };
  // Meta documents HTTP 400 for both 130429 and 80007 throughput limits.
  if (rateLimitCodes.has(code) && (status === 400 || status === 429)) {
    const delay = retryAfterSeconds(retryAfter);
    return delay === undefined ? { kind: "NOT_ACCEPTED", reason: "RATE_LIMIT" }
      : { kind: "NOT_ACCEPTED", reason: "RATE_LIMIT", retryAfterSeconds: delay };
  }
  if (status >= 400 && status < 500) {
    if (recipientCodes.has(code)) return { kind: "PERMANENT", reason: "RECIPIENT" };
    if (templateCodes.has(code)) return { kind: "PERMANENT", reason: "TEMPLATE" };
    if (authCodes.has(code)) return { kind: "PERMANENT", reason: "AUTH" };
    if (policyCodes.has(code)) return { kind: "PERMANENT", reason: "POLICY" };
  }
  return { kind: "UNKNOWN", reason: "TRANSPORT" };
}
