/**
 * Shared parser for VAYLET Employee static resource QR payloads (DEC-067 §4).
 *
 * V1 payloads are exactly:
 *   vaylet:key-slot:<RESOURCE_CODE>
 *   vaylet:parking-spot:<RESOURCE_CODE>
 *
 * Payloads are typed, non-secret and NON-AUTHORITATIVE evidence material.
 * The parser accepts only the exact prefixes above, applies the accepted
 * trim-surrounding-whitespace-only server/manual semantics (DEC-037/DEC-065),
 * preserves the resource code byte-exact (no case folding, no fuzzy
 * normalization) and rejects everything else without ambiguity.
 */

export type QrResourceKind = "key-slot" | "parking-spot";

export type QrResourceRejectionReason =
  "empty" | "too-long" | "wrong-type" | "unrecognized";

export interface QrResourcePayload {
  readonly kind: QrResourceKind;
  readonly resourceCode: string;
}

export type QrResourceParseResult =
  | { readonly ok: true; readonly payload: QrResourcePayload }
  | { readonly ok: false; readonly reason: QrResourceRejectionReason };

/** Exact V1 payload prefixes, locked by DEC-067 §4. */
export const RESOURCE_QR_PREFIXES: Readonly<Record<QrResourceKind, string>> = {
  "key-slot": "vaylet:key-slot:",
  "parking-spot": "vaylet:parking-spot:",
};

/** Total payload length cap including the prefix. */
export const RESOURCE_QR_MAX_LENGTH = 120;

const KINDS: readonly QrResourceKind[] = ["key-slot", "parking-spot"];

function reject(reason: QrResourceRejectionReason): QrResourceParseResult {
  return { ok: false, reason };
}

/**
 * Parses one decoded QR text against the expected resource kind. Surrounding
 * whitespace is trimmed (transport semantics only); the resource code itself
 * is preserved exactly as encoded.
 */
export function parseResourceQr(
  rawText: unknown,
  expectedKind: QrResourceKind,
): QrResourceParseResult {
  if (typeof rawText !== "string") return reject("unrecognized");
  const text = rawText.trim();
  if (text.length === 0) return reject("empty");
  if (text.length > RESOURCE_QR_MAX_LENGTH) return reject("too-long");

  const expectedPrefix = RESOURCE_QR_PREFIXES[expectedKind];
  if (text.startsWith(expectedPrefix)) {
    const resourceCode = text.slice(expectedPrefix.length);
    if (resourceCode.length === 0) return reject("empty");
    return {
      ok: true,
      payload: { kind: expectedKind, resourceCode },
    };
  }

  for (const kind of KINDS) {
    if (kind === expectedKind) continue;
    if (text.startsWith(RESOURCE_QR_PREFIXES[kind])) {
      return reject("wrong-type");
    }
  }

  return reject("unrecognized");
}

/** True when the text carries ANY known VAYLET resource prefix. */
export function hasKnownResourcePrefix(text: string): boolean {
  return KINDS.some((kind) => text.startsWith(RESOURCE_QR_PREFIXES[kind]));
}
