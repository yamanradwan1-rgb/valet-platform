import {
  webPushSubscriptionRequestSchema,
  type WebPushLocale,
  type WebPushSubscriptionRequest,
} from "@valet/contracts";

export function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Push unavailable.");
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const decoded = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  if (bytes.length !== 65 || bytes[0] !== 4)
    throw new Error("Push unavailable.");
  return bytes;
}

function encodeKey(
  subscription: PushSubscription,
  name: PushEncryptionKeyName,
) {
  const value = subscription.getKey(name);
  if (value === null) throw new Error("Push unavailable.");
  const binary = Array.from(new Uint8Array(value), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function toCustomerPushSubscriptionRequest(
  subscription: PushSubscription,
  locale: WebPushLocale,
): WebPushSubscriptionRequest {
  return webPushSubscriptionRequestSchema.parse({
    auth: encodeKey(subscription, "auth"),
    browserExpiresAt:
      subscription.expirationTime === null
        ? null
        : new Date(subscription.expirationTime).toISOString(),
    endpoint: subscription.endpoint,
    locale,
    p256dh: encodeKey(subscription, "p256dh"),
  });
}
