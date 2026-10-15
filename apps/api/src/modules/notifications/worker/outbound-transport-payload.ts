import type { OutboundEnvelopeOpener } from "../contracts/outbound-envelope";
import type { OutboundSendInput } from "../contracts/outbound-provider";
import type { OutboundTransportMaterial } from "./outbound-transport-source";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/** The canonical HTTPS Guest origin is operational configuration, never customer input. */
export function canonicalGuestOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("OUTBOUND_GUEST_ORIGIN_INVALID");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" || parsed.password !== "" ||
    parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== ""
  ) {
    throw new Error("OUTBOUND_GUEST_ORIGIN_INVALID");
  }
  return parsed.origin;
}

export function prepareOutboundSendInput(
  material: OutboundTransportMaterial,
  attemptHandle: string,
  origin: string,
  signal: AbortSignal,
  opener: OutboundEnvelopeOpener,
): OutboundSendInput {
  if (
    !E164_PATTERN.test(material.recipientE164) ||
    !/^[a-z0-9_]{1,512}$/.test(material.templateName) ||
    !/^(ar|en)$/.test(material.templateLanguage) ||
    !/^[0-9]{1,32}$/.test(material.phoneNumberId) ||
    !/^v[0-9]{1,3}\.[0-9]{1,3}$/.test(material.graphVersion) ||
    material.accessToken.trim() === ""
  ) {
    throw new Error("OUTBOUND_TRANSPORT_CONFIG_INVALID");
  }
  const token = opener.open(material.sealed, material.expectedAAD);
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("OUTBOUND_ENVELOPE_INVALID");
  }
  return {
    attemptHandle,
    recipientE164: material.recipientE164,
    templateName: material.templateName,
    templateLanguage: material.templateLanguage,
    phoneNumberId: material.phoneNumberId,
    accessToken: material.accessToken,
    graphVersion: material.graphVersion,
    guestUrl: `${origin}/#guestToken=${token}`,
    signal,
  };
}
