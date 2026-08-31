import { describe, expect, it } from "vitest";

import {
  NodeWebPushSender,
  webPushErrorMetadata,
} from "../src/modules/web-push-delivery/web-push-sender";

describe("Node Web Push sender adapter", () => {
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
});
