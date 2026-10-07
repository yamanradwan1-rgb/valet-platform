export type GuestCredential =
  | { readonly kind: "LEGACY_BEARER"; readonly secret: string }
  | { readonly kind: "BROWSER_SESSION"; readonly secret: string };

export type GuestCredentialInput = GuestCredential | string;

export type GuestAuthorityScope = "ACTIVE" | "POST_VISIT";

export interface GuestCredentialResolution<T> {
  readonly scope: GuestAuthorityScope;
  readonly session: T;
}

export function guestCredentialSecret(credential: GuestCredential): string {
  return credential.secret;
}

export function normalizeGuestCredential(
  credential: GuestCredentialInput,
): GuestCredential {
  return typeof credential === "string"
    ? { kind: "LEGACY_BEARER", secret: credential }
    : credential;
}
