import { createHash } from "node:crypto";

export const guestAccessContract = {
  hashPrefix: "sha256:v1:",
  lifetimeMilliseconds: 24 * 60 * 60 * 1_000,
  rawTokenCharacters: 43,
  tokenEntropyBytes: 32,
} as const;

export type GuestAccessErrorCode =
  | "GUEST_ACCESS_GENERATION_FAILED"
  | "GUEST_ACCESS_INVALID"
  | "GUEST_ACCESS_INTENT_CONFLICT"
  | "GUEST_ACCESS_REQUEST_INVALID";

const errorMessages: Record<GuestAccessErrorCode, string> = {
  GUEST_ACCESS_GENERATION_FAILED: "Guest access could not be generated safely.",
  GUEST_ACCESS_INVALID: "Guest access is invalid.",
  GUEST_ACCESS_INTENT_CONFLICT:
    "Guest access intent does not match the current access state.",
  GUEST_ACCESS_REQUEST_INVALID: "The guest access request is invalid.",
};

export class GuestAccessError extends Error {
  readonly code: GuestAccessErrorCode;

  constructor(code: GuestAccessErrorCode) {
    super(errorMessages[code]);
    this.name = "GuestAccessError";
    this.code = code;
  }
}

export function hashGuestAccessToken(rawToken: string): string {
  return `${guestAccessContract.hashPrefix}${createHash("sha256")
    .update(rawToken, "utf8")
    .digest("hex")}`;
}
