import type { StaffPushProviderResult } from "./staff-push-provider";

const FCM_ERROR_TYPE = "type.googleapis.com/google.firebase.fcm.v1.FcmError";
const BAD_REQUEST_TYPE = "type.googleapis.com/google.rpc.BadRequest";

interface FcmErrorDetail {
  readonly "@type"?: unknown;
  readonly errorCode?: unknown;
}

interface FcmErrorBody {
  readonly error?: {
    readonly details?: unknown;
    readonly status?: unknown;
  };
}

function detailArray(body: unknown): readonly FcmErrorDetail[] {
  if (body === null || typeof body !== "object") return [];
  const details = (body as FcmErrorBody).error?.details;
  return Array.isArray(details)
    ? details.filter(
        (detail): detail is FcmErrorDetail =>
          detail !== null && typeof detail === "object",
      )
    : [];
}

function statusFrom(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const status = (body as FcmErrorBody).error?.status;
  return typeof status === "string" ? status : undefined;
}

function fcmCode(details: readonly FcmErrorDetail[]): string | undefined {
  const detail = details.find((item) => item["@type"] === FCM_ERROR_TYPE);
  return typeof detail?.errorCode === "string" ? detail.errorCode : undefined;
}

export function parseRetryAfter(
  value: string | null,
  nowMilliseconds: number,
): number | undefined {
  if (value === null) return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, Math.ceil((timestamp - nowMilliseconds) / 1_000));
}

export function mapFcmResult(input: {
  readonly body: unknown;
  readonly httpStatus: number;
  readonly payloadProvenValid: boolean;
  readonly retryAfter: string | null;
  readonly nowMilliseconds: number;
}): StaffPushProviderResult {
  if (input.httpStatus >= 200 && input.httpStatus < 300) {
    const name =
      input.body !== null && typeof input.body === "object"
        ? (input.body as { name?: unknown }).name
        : undefined;
    return { resultClass: typeof name === "string" ? "ACCEPTED" : "UNKNOWN" };
  }
  const details = detailArray(input.body);
  const code = fcmCode(details);
  const status = statusFrom(input.body);
  if (code === "UNREGISTERED") return { resultClass: "INVALID_ENDPOINT" };
  if (
    code === "INVALID_ARGUMENT" &&
    input.payloadProvenValid &&
    !details.some((detail) => detail["@type"] === BAD_REQUEST_TYPE)
  ) {
    return { resultClass: "INVALID_ENDPOINT" };
  }
  if (
    input.httpStatus === 429 ||
    code === "QUOTA_EXCEEDED" ||
    status === "RESOURCE_EXHAUSTED"
  ) {
    const retryAfterSeconds = parseRetryAfter(
      input.retryAfter,
      input.nowMilliseconds,
    );
    return retryAfterSeconds === undefined
      ? { resultClass: "RATE_LIMITED" }
      : { resultClass: "RATE_LIMITED", retryAfterSeconds };
  }
  if (
    code === "UNAVAILABLE" ||
    code === "INTERNAL" ||
    input.httpStatus >= 500
  ) {
    return { resultClass: "TRANSIENT" };
  }
  if (
    input.httpStatus === 401 ||
    input.httpStatus === 403 ||
    status === "UNAUTHENTICATED" ||
    status === "PERMISSION_DENIED" ||
    code === "SENDER_ID_MISMATCH" ||
    code === "THIRD_PARTY_AUTH_ERROR"
  ) {
    return { resultClass: "CONFIGURATION" };
  }
  if (status === "INVALID_ARGUMENT" || input.httpStatus === 400) {
    return { resultClass: "PERMANENT" };
  }
  if (input.httpStatus === 404) return { resultClass: "CONFIGURATION" };
  return { resultClass: "UNKNOWN" };
}
