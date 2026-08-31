export type CustomerPushPublicConfig =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly vapidPublicKey: string };

const PUBLIC_KEY_PATTERN = /^B[A-P][A-Za-z0-9_-]{84}[AEIMQUYcgkosw048]$/;

export function parseCustomerPushPublicConfig(input: {
  readonly enabled?: string | undefined;
  readonly vapidPublicKey?: string | undefined;
}): CustomerPushPublicConfig {
  if (input.enabled !== "true") return { enabled: false };
  if (!input.vapidPublicKey || !PUBLIC_KEY_PATTERN.test(input.vapidPublicKey)) {
    return { enabled: false };
  }
  return { enabled: true, vapidPublicKey: input.vapidPublicKey };
}

export function readCustomerPushPublicConfig(): CustomerPushPublicConfig {
  if (process.env.NODE_ENV !== "production") return { enabled: false };
  return parseCustomerPushPublicConfig({
    enabled: process.env.NEXT_PUBLIC_WEB_PUSH_ENABLED,
    vapidPublicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY,
  });
}
