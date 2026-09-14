export type NativeCustomerAppOriginResult =
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly reason: "INVALID" | "MISSING" };

export const NATIVE_RELEASE_CUSTOMER_APP_ORIGIN_ERROR: string;

export function resolveNativeCustomerAppOrigin(input: {
  readonly isProduction: boolean;
  readonly raw: string | null | undefined;
}): NativeCustomerAppOriginResult;

export function requireNativeReleaseCustomerAppOrigin(
  raw: string | null | undefined,
): string;
