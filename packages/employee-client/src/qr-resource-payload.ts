/** Shared static physical-resource QR grammar (DEC-067 + DEC-096). */
export type QrResourceKind = "key-slot" | "parking-spot";
export type QrResourceVersion = "V1" | "V2";

export type QrResourceRejectionReason =
  | "empty"
  | "too-long"
  | "wrong-type"
  | "unrecognized";

interface QrResourcePayloadBase {
  readonly kind: QrResourceKind;
  readonly resourceCode: string;
}

export interface QrResourcePayloadV1 extends QrResourcePayloadBase {
  readonly resourceId: null;
  readonly version: "V1";
}

export interface QrResourcePayloadV2 extends QrResourcePayloadBase {
  readonly resourceId: string;
  readonly version: "V2";
}

export type QrResourcePayload = QrResourcePayloadV1 | QrResourcePayloadV2;
export type QrResourceParseResult =
  | { readonly ok: true; readonly payload: QrResourcePayload }
  | { readonly ok: false; readonly reason: QrResourceRejectionReason };

export const RESOURCE_QR_PREFIXES: Readonly<Record<QrResourceKind, string>> = {
  "key-slot": "vaylet:key-slot:",
  "parking-spot": "vaylet:parking-spot:",
};

export const RESOURCE_QR_V2_PREFIXES: Readonly<Record<QrResourceKind, string>> = {
  "key-slot": "vaylet:v2:key-slot:",
  "parking-spot": "vaylet:v2:parking-spot:",
};

export const RESOURCE_QR_MAX_LENGTH = 120;
export const RESOURCE_QR_V2_MAX_LENGTH = 160;

const KINDS: readonly QrResourceKind[] = ["key-slot", "parking-spot"];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reject(reason: QrResourceRejectionReason): QrResourceParseResult {
  return { ok: false, reason };
}

function parseV1(text: string, kind: QrResourceKind): QrResourceParseResult | null {
  const prefix = RESOURCE_QR_PREFIXES[kind];
  if (!text.startsWith(prefix)) return null;
  if (text.length > RESOURCE_QR_MAX_LENGTH) return reject("too-long");
  const resourceCode = text.slice(prefix.length);
  if (resourceCode.length === 0) return reject("empty");
  return {
    ok: true,
    payload: { kind, resourceCode, resourceId: null, version: "V1" },
  };
}

function parseV2(text: string, kind: QrResourceKind): QrResourceParseResult | null {
  const prefix = RESOURCE_QR_V2_PREFIXES[kind];
  if (!text.startsWith(prefix)) return null;
  if (text.length > RESOURCE_QR_V2_MAX_LENGTH) return reject("too-long");
  const body = text.slice(prefix.length);
  const resourceId = body.slice(0, 36);
  if (!UUID_PATTERN.test(resourceId) || body[36] !== ":") {
    return reject("unrecognized");
  }
  const resourceCode = body.slice(37);
  if (resourceCode.length === 0) return reject("empty");
  return {
    ok: true,
    payload: { kind, resourceCode, resourceId, version: "V2" },
  };
}

export function parseResourceQr(
  rawText: unknown,
  expectedKind: QrResourceKind,
): QrResourceParseResult {
  if (typeof rawText !== "string") return reject("unrecognized");
  const text = rawText.trim();
  if (text.length === 0) return reject("empty");
  const expected = parseV2(text, expectedKind) ?? parseV1(text, expectedKind);
  if (expected !== null) return expected;
  for (const kind of KINDS) {
    if (kind === expectedKind) continue;
    if (
      text.startsWith(RESOURCE_QR_PREFIXES[kind]) ||
      text.startsWith(RESOURCE_QR_V2_PREFIXES[kind])
    ) {
      return reject("wrong-type");
    }
  }
  return reject("unrecognized");
}

export function hasKnownResourcePrefix(text: string): boolean {
  return KINDS.some(
    (kind) =>
      text.startsWith(RESOURCE_QR_PREFIXES[kind]) ||
      text.startsWith(RESOURCE_QR_V2_PREFIXES[kind]),
  );
}
