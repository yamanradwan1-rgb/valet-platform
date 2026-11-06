import { describe, expect, it } from "vitest";

import {
  decodeVapidPublicKey,
  subscriptionMatchesVapidKey,
} from "./guest-web-push-vapid";

const publicKeyBytes = new Uint8Array(65);
publicKeyBytes[0] = 4;
for (let index = 1; index < publicKeyBytes.length; index += 1) {
  publicKeyBytes[index] = index;
}
const encodedKey = btoa(String.fromCharCode(...publicKeyBytes))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

function subscription(key: BufferSource | null): PushSubscription {
  return {
    options: { applicationServerKey: key, userVisibleOnly: true },
  } as PushSubscription;
}

describe("Guest Web Push VAPID subscription binding", () => {
  it("decodes unpadded URL-safe public keys into the exact raw browser bytes", () => {
    expect(new Uint8Array(decodeVapidPublicKey(encodedKey))).toEqual(publicKeyBytes);
  });

  it("accepts an exact current application server key", () => {
    expect(subscriptionMatchesVapidKey(subscription(publicKeyBytes.buffer), encodedKey)).toBe(true);
  });

  it("rejects a rotated key, incomplete browser options or missing key proof", () => {
    const rotated = new Uint8Array(publicKeyBytes);
    rotated[1] = (rotated[1] ?? 0) ^ 1;
    expect(subscriptionMatchesVapidKey(subscription(rotated.buffer), encodedKey)).toBe(false);
    expect(subscriptionMatchesVapidKey(subscription(null), encodedKey)).toBe(false);
    expect(subscriptionMatchesVapidKey({} as PushSubscription, encodedKey)).toBe(false);
  });
});
