import { ApiTransportValidationError } from "../../common/http/api-errors";
import { guestWebPushEndpointAllowed } from "../guest-push/guest-web-push-adapter";

export interface GuestPushRegistrationRequest {
  readonly auth: string;
  readonly endpoint: string;
  readonly locale: "ar" | "en";
  readonly p256dh: string;
}

export interface GuestPushPublicConfig {
  readonly enabled: boolean;
  readonly publicKey: string | null;
}

export class GuestPushRegistrationUnavailableError extends Error {
  readonly code = "GUEST_PUSH_REGISTRATION_UNAVAILABLE";

  constructor() {
    super("Guest notifications are temporarily unavailable.");
    this.name = "GuestPushRegistrationUnavailableError";
  }
}

const P256DH_PATTERN = /^[A-Za-z0-9_-]{80,128}={0,2}$/;
const AUTH_PATTERN = /^[A-Za-z0-9_-]{16,64}={0,2}$/;

export function parseGuestPushRegistrationRequest(
  value: unknown,
): GuestPushRegistrationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiTransportValidationError();
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).sort().join(",") !== "auth,endpoint,locale,p256dh" ||
    typeof input.endpoint !== "string" ||
    input.endpoint.length > 4096 ||
    !guestWebPushEndpointAllowed(input.endpoint) ||
    typeof input.p256dh !== "string" ||
    !P256DH_PATTERN.test(input.p256dh) ||
    typeof input.auth !== "string" ||
    !AUTH_PATTERN.test(input.auth) ||
    (input.locale !== "en" && input.locale !== "ar")
  ) {
    throw new ApiTransportValidationError();
  }
  return {
    auth: input.auth,
    endpoint: input.endpoint,
    locale: input.locale,
    p256dh: input.p256dh,
  };
}
