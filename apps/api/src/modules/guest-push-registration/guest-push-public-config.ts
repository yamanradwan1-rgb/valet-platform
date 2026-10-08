import type { GuestPushPublicConfig } from "./guest-push-registration-types";

const disabled: GuestPushPublicConfig = { enabled: false, publicKey: null };
const VAPID_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{80,100}$/;

export function readGuestPushPublicConfig(
  env: NodeJS.ProcessEnv = process.env,
): GuestPushPublicConfig {
  if (env.GUEST_PUSH_REGISTRATION_ENABLED !== "true") return disabled;
  const publicKey = env.GUEST_PUSH_VAPID_PUBLIC_KEY;
  if (
    publicKey === undefined ||
    !VAPID_PUBLIC_KEY_PATTERN.test(publicKey)
  ) return disabled;
  return { enabled: true, publicKey };
}
