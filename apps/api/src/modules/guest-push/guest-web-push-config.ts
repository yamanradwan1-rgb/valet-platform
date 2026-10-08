export interface GuestWebPushConfig {
  readonly privateKey: string;
  readonly publicKey: string;
  readonly subject: string;
  readonly timeoutMilliseconds: number;
}

const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

function requiredKey(
  env: NodeJS.ProcessEnv,
  name: string,
  minLength: number,
  maxLength: number,
): string {
  const value = env[name];
  if (
    value === undefined ||
    value.length < minLength ||
    value.length > maxLength ||
    !KEY_PATTERN.test(value)
  ) {
    throw new Error(`Required Guest Web Push configuration is invalid: ${name}.`);
  }
  return value;
}

function requiredSubject(env: NodeJS.ProcessEnv): string {
  const value = env.GUEST_PUSH_VAPID_SUBJECT;
  if (value === undefined || value.length > 256 || /\s/.test(value)) {
    throw new Error(
      "Required Guest Web Push configuration is invalid: GUEST_PUSH_VAPID_SUBJECT.",
    );
  }
  if (/^mailto:[^@]+@[^@]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === ""
    ) {
      return value;
    }
  } catch {
    // Normalize all malformed values to the same secret-free configuration error.
  }
  throw new Error(
    "Required Guest Web Push configuration is invalid: GUEST_PUSH_VAPID_SUBJECT.",
  );
}

export function readGuestWebPushConfig(
  env: NodeJS.ProcessEnv,
  sendingEnabled: boolean,
  providerCallTimeoutSeconds: number,
): GuestWebPushConfig | undefined {
  if (!sendingEnabled) return undefined;
  if (
    !Number.isInteger(providerCallTimeoutSeconds) ||
    providerCallTimeoutSeconds <= 0
  ) {
    throw new Error("Guest Web Push provider timeout is invalid.");
  }
  return {
    privateKey: requiredKey(env, "GUEST_PUSH_VAPID_PRIVATE_KEY", 40, 60),
    publicKey: requiredKey(env, "GUEST_PUSH_VAPID_PUBLIC_KEY", 80, 100),
    subject: requiredSubject(env),
    timeoutMilliseconds: providerCallTimeoutSeconds * 1_000,
  };
}
