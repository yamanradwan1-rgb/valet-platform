import { createECDH, timingSafeEqual } from "node:crypto";

const base64urlPattern = /^[A-Za-z0-9_-]+$/;
const keyVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface WebPushStorageKey {
  readonly key: Buffer;
  readonly version: string;
}

export interface WebPushServerConfig {
  readonly enabled: boolean;
  readonly endpointFingerprintKey?: Buffer;
  readonly storageKeys?: {
    readonly active: WebPushStorageKey;
    readonly previous?: WebPushStorageKey;
  };
  readonly vapid?: {
    readonly privateKey: string;
    readonly publicKey: string;
    readonly subject: string;
  };
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required when Web Push is enabled.`);
  }
  return value;
}

function decodeKey(value: string, name: string): Buffer {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(`${name} must be 32-byte unpadded base64url.`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32) {
    throw new Error(`${name} must be 32-byte unpadded base64url.`);
  }
  return decoded;
}

function parseSubject(value: string): string {
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === ""
    ) {
      return value;
    }
  } catch {
    // Use one non-secret configuration error below.
  }
  throw new Error("WEB_PUSH_VAPID_SUBJECT must be mailto: or HTTPS.");
}

function parseVersion(value: string, name: string): string {
  if (!keyVersionPattern.test(value)) {
    throw new Error(`${name} is malformed.`);
  }
  return value;
}

function assertVapidKeyPair(publicKey: string, privateKey: string): void {
  try {
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(privateKey, "base64url"));
    const derived = curve.getPublicKey(undefined, "uncompressed");
    const configured = Buffer.from(publicKey, "base64url");
    if (!timingSafeEqual(derived, configured)) throw new Error();
  } catch {
    throw new Error("WEB_PUSH_VAPID key pair is invalid.");
  }
}

export function loadWebPushServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WebPushServerConfig {
  const enabledValue = environment.WEB_PUSH_ENABLED;
  if (enabledValue === undefined || enabledValue === "false") {
    return { enabled: false };
  }
  if (enabledValue !== "true") {
    throw new Error("WEB_PUSH_ENABLED must be true or false.");
  }

  const publicKey = required(environment, "WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = required(environment, "WEB_PUSH_VAPID_PRIVATE_KEY");
  const decodedPublicKey = Buffer.from(publicKey, "base64url");
  if (
    !base64urlPattern.test(publicKey) ||
    publicKey.length !== 87 ||
    decodedPublicKey.length !== 65 ||
    decodedPublicKey[0] !== 4
  ) {
    throw new Error("WEB_PUSH_VAPID_PUBLIC_KEY is malformed.");
  }
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(privateKey) ||
    Buffer.from(privateKey, "base64url").length !== 32
  ) {
    throw new Error("WEB_PUSH_VAPID_PRIVATE_KEY is malformed.");
  }
  assertVapidKeyPair(publicKey, privateKey);

  const activeVersion = parseVersion(
    required(environment, "WEB_PUSH_STORAGE_KEY_ACTIVE_VERSION"),
    "WEB_PUSH_STORAGE_KEY_ACTIVE_VERSION",
  );
  const previousVersion = environment.WEB_PUSH_STORAGE_KEY_PREVIOUS_VERSION;
  const previousKey = environment.WEB_PUSH_STORAGE_KEY_PREVIOUS_B64URL;
  if ((previousVersion === undefined) !== (previousKey === undefined)) {
    throw new Error(
      "Previous Web Push storage key version and key are paired.",
    );
  }

  const previous =
    previousVersion === undefined || previousKey === undefined
      ? undefined
      : {
          key: decodeKey(previousKey, "WEB_PUSH_STORAGE_KEY_PREVIOUS_B64URL"),
          version: parseVersion(
            previousVersion,
            "WEB_PUSH_STORAGE_KEY_PREVIOUS_VERSION",
          ),
        };
  if (previous?.version === activeVersion) {
    throw new Error("Active and previous Web Push key versions must differ.");
  }
  const activeKey = decodeKey(
    required(environment, "WEB_PUSH_STORAGE_KEY_ACTIVE_B64URL"),
    "WEB_PUSH_STORAGE_KEY_ACTIVE_B64URL",
  );
  const fingerprintKey = decodeKey(
    required(environment, "WEB_PUSH_ENDPOINT_FINGERPRINT_KEY_B64URL"),
    "WEB_PUSH_ENDPOINT_FINGERPRINT_KEY_B64URL",
  );
  if (previous?.key.equals(activeKey)) {
    throw new Error("Active and previous Web Push storage keys must differ.");
  }
  if (
    fingerprintKey.equals(activeKey) ||
    (previous !== undefined && fingerprintKey.equals(previous.key))
  ) {
    throw new Error(
      "Web Push endpoint fingerprint and storage keys must differ.",
    );
  }
  return {
    enabled: true,
    endpointFingerprintKey: fingerprintKey,
    storageKeys: {
      active: {
        key: activeKey,
        version: activeVersion,
      },
      ...(previous === undefined ? {} : { previous }),
    },
    vapid: {
      privateKey,
      publicKey,
      subject: parseSubject(required(environment, "WEB_PUSH_VAPID_SUBJECT")),
    },
  };
}

export function webPushPublicConfig(config: WebPushServerConfig) {
  return config.enabled
    ? { enabled: true as const, vapidPublicKey: config.vapid!.publicKey }
    : { enabled: false as const };
}
