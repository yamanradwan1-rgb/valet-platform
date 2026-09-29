import {
  parseResourceQr,
  type QrResourceKind,
  type QrResourcePayload,
} from "./qr-resource-payload";

// Existing Employee Web handoff pattern, shared without a new protocol.
export const DYNAMIC_QR_PATTERN = /^vhq1\.[A-Za-z0-9_-]{43}$/;
export type QrInputKind = QrResourceKind | "dynamic-handoff";
export type QrInput =
  | QrResourcePayload
  | { readonly kind: "dynamic-handoff"; readonly proof: string };
export type QrInputResult =
  | { readonly ok: true; readonly value: QrInput }
  | { readonly ok: false; readonly reason: string };

export function parseQrInput(raw: unknown, kind: QrInputKind): QrInputResult {
  if (kind !== "dynamic-handoff") {
    const result = parseResourceQr(raw, kind);
    return result.ok ? { ok: true, value: result.payload } : result;
  }
  if (typeof raw !== "string") return { ok: false, reason: "invalid-format" };
  return DYNAMIC_QR_PATTERN.test(raw)
    ? { ok: true, value: { kind, proof: raw } }
    : { ok: false, reason: "invalid-format" };
}
