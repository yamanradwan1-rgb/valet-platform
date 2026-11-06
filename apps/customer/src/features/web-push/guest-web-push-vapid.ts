/**
 * Compare the physical browser subscription with the server's current VAPID
 * application server key. An ACTIVE endpoint row cannot prove key continuity.
 */
export function decodeVapidPublicKey(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export function subscriptionMatchesVapidKey(
  subscription: PushSubscription,
  publicKey: string,
): boolean {
  const key = subscription.options?.applicationServerKey;
  if (!key) return false;

  const actual = new Uint8Array(key);
  const expected = new Uint8Array(decodeVapidPublicKey(publicKey));
  return (
    actual.length === expected.length &&
    actual.every((byte, index) => byte === expected[index])
  );
}
