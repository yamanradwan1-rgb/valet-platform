import { beforeEach, describe, expect, it, vi } from "vitest";

const webPushClient = vi.hoisted(() => ({
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => ({ default: webPushClient }));

import {
  NodeWebPushSender,
  webPushErrorMetadata,
} from "../src/modules/web-push-delivery/web-push-sender";

describe("Node Web Push sender adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("makes no provider request when Web Push is disabled", async () => {
    const sender = new NodeWebPushSender({ enabled: false });
    await expect(
      sender.send({
        auth: "not-used",
        endpoint: "https://push.test/not-used",
        p256dh: "not-used",
        payload: "{}",
        ttlSeconds: 30,
      }),
    ).resolves.toEqual({ statusCode: 401 });
  });

  it("preserves the Node/web-push Retry-After header representation", () => {
    expect(
      webPushErrorMetadata({
        body: "must never be copied",
        endpoint: "https://must-never-be-copied.test",
        headers: { "retry-after": ["17"] },
        statusCode: 429,
      }),
    ).toEqual({ retryAfter: "17", statusCode: 429 });
  });

  it("passes zero TTL through to web-push for immediate delivery", async () => {
    webPushClient.sendNotification.mockResolvedValue({ statusCode: 201 });
    const sender = new NodeWebPushSender({
      enabled: true,
      storageKeys: {
        active: { key: Buffer.alloc(32), version: "active" },
      },
      vapid: {
        privateKey: "private",
        publicKey: "public",
        subject: "mailto:push@example.test",
      },
    });

    await expect(
      sender.send({
        auth: "auth",
        endpoint: "https://push.example.test/subscription",
        p256dh: "p256dh",
        payload: "{}",
        ttlSeconds: 0,
      }),
    ).resolves.toEqual({ statusCode: 201 });
    expect(webPushClient.sendNotification).toHaveBeenCalledWith(
      expect.any(Object),
      "{}",
      expect.objectContaining({ TTL: 0 }),
    );
  });
});
