export type EmployeePushPublicConfig =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly vapidPublicKey: string };

const publicKeyPattern = /^B[A-P][A-Za-z0-9_-]{84}[AEIMQUYcgkosw048]$/;

export function parseEmployeePushPublicConfig(input: {
  readonly enabled?: string | undefined;
  readonly vapidPublicKey?: string | undefined;
}): EmployeePushPublicConfig {
  if (input.enabled !== "true") return { enabled: false };
  if (
    input.vapidPublicKey === undefined ||
    !publicKeyPattern.test(input.vapidPublicKey)
  ) {
    return { enabled: false };
  }
  return { enabled: true, vapidPublicKey: input.vapidPublicKey };
}

export function readEmployeePushPublicConfig(): EmployeePushPublicConfig {
  if (process.env.NODE_ENV !== "production") return { enabled: false };
  return parseEmployeePushPublicConfig({
    enabled: process.env.NEXT_PUBLIC_WEB_PUSH_ENABLED,
    vapidPublicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY,
  });
}
