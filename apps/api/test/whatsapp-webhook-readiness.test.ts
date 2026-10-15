import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import { MetaWhatsAppWebhookController } from "../src/modules/notifications/webhooks/meta-webhook.controller";

const query = {
  "hub.mode": "subscribe",
  "hub.verify_token": "synthetic-verify-token-for-tests",
  "hub.challenge": "123456",
};
const secret = "synthetic-meta-app-secret-not-live";
const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');

function configure(mode: "disabled" | "test") {
  vi.stubEnv("OUTBOUND_MESSAGING_MODE", mode);
  vi.stubEnv("META_WHATSAPP_APP_SECRET", secret);
  vi.stubEnv("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN", query["hub.verify_token"]);
  vi.stubEnv("OUTBOUND_RECIPIENT_HMAC_KEY_BASE64",
    Buffer.alloc(32, 31).toString("base64"));
  vi.stubEnv("OUTBOUND_RECIPIENT_HMAC_KEY_VERSION", "v1");
}

function syntheticPool() {
  const queries: string[] = [];
  const client = {
    query: async (text: string) => {
      queries.push(text);
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
  return {
    pool: { connect: async () => client } as unknown as PostgresPool,
    queries,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("Meta webhook subscription and signed callback readiness", () => {
  it("does not enroll Meta while messaging receiver is disabled", () => {
    configure("disabled");
    const controller = new MetaWhatsAppWebhookController(syntheticPool().pool);
    expect(() => controller.getChallenge(query)).toThrow("WEBHOOK_NOT_CONFIGURED");
    const unconfigured = new MetaWhatsAppWebhookController(null);
    expect(() => unconfigured.getChallenge(query)).toThrow("WEBHOOK_NOT_CONFIGURED");
  });

  it("accepts verify challenge only with valid durable receiver configuration", () => {
    configure("test");
    const controller = new MetaWhatsAppWebhookController(syntheticPool().pool);
    expect(controller.getChallenge(query)).toBe("123456");
    expect(() => controller.getChallenge({
      ...query, "hub.verify_token": "untrusted",
    })).toThrow();
    vi.stubEnv("OUTBOUND_RECIPIENT_HMAC_KEY_BASE64", "");
    expect(() => controller.getChallenge(query)).toThrow("WEBHOOK_NOT_CONFIGURED");
  });

  it("validates exact signature and commits eligible callbacks, with send switch OFF", async () => {
    configure("test");
    vi.stubEnv("OUTBOUND_MESSAGING_SEND_ENABLED", "false");
    const fake = syntheticPool();
    const controller = new MetaWhatsAppWebhookController(fake.pool);
    const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    await expect(controller.receive({ rawBody: body }, "sha256=" + "0".repeat(64)))
      .rejects.toMatchObject({ status: 403 });
    await expect(controller.receive({ rawBody: body }, signature))
      .resolves.toEqual({ received: true });
    expect(fake.queries).toContain("COMMIT");
    expect(fake.queries).not.toContain("ROLLBACK");
    vi.stubEnv("OUTBOUND_MESSAGING_MODE", "disabled");
    await expect(controller.receive({ rawBody: body }, signature))
      .rejects.toMatchObject({ status: 503 });
  });
});
