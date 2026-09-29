// Web compatibility boundary; Native consumes the same portable grammar.
export {
  hasKnownResourcePrefix,
  parseResourceQr,
  RESOURCE_QR_MAX_LENGTH,
  RESOURCE_QR_PREFIXES,
  RESOURCE_QR_V2_MAX_LENGTH,
  RESOURCE_QR_V2_PREFIXES,
  type QrResourceKind,
  type QrResourceParseResult,
  type QrResourcePayload,
  type QrResourcePayloadV1,
  type QrResourcePayloadV2,
  type QrResourceRejectionReason,
  type QrResourceVersion,
} from "@valet/employee-client";
