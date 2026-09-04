// Web compatibility boundary; Native consumes the same portable grammar.
export {
  hasKnownResourcePrefix,
  parseResourceQr,
  RESOURCE_QR_MAX_LENGTH,
  RESOURCE_QR_PREFIXES,
  type QrResourceKind,
  type QrResourceParseResult,
  type QrResourcePayload,
  type QrResourceRejectionReason,
} from "@valet/employee-client";
