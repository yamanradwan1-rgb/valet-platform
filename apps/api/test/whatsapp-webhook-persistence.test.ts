import { describe, expect, it } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import { applyMetaEvents } from "../src/modules/notifications/webhooks/meta-webhook-delivery";
import type { MetaWebhookStatus } from "../src/modules/notifications/webhooks/meta-webhook-events";

const key = Buffer.alloc(32, 0x5d).toString("base64");
const env = {
  OUTBOUND_RECIPIENT_HMAC_KEY_BASE64: key,
  OUTBOUND_RECIPIENT_HMAC_KEY_VERSION: "v1",
  OUTBOUND_MESSAGING_MODE: "test",
};
const event: MetaWebhookStatus = {
  wabaId: "test-waba", phoneNumberId: "test-phone", providerMessageId: "wamid.test",
  recipientId: "962790000000", providerTime: new Date("2026-10-15T18:00:00Z"),
  status: "DELIVERED",
};

function poolMock(binding = true, fail = false) {
  const queries: { text: string; params?: unknown[] }[] = [];
  let released = false;
  const tx = {
    query: async (text: string, params?: unknown[]) => {
      queries.push({ text, ...(params === undefined ? {} : { params }) });
      if (fail && text.includes("outbound_record_provider_event"))
        throw new Error("DB_FAIL");
      if (text.includes("outbound_resolve_meta_binding")) return {
        rowCount: binding ? 1 : 0,
        rows: binding ? [{ bindingId: "e640f743-e9ec-4ca5-a48e-a6c5cbf46574" }] : [],
      };
      return { rowCount: 1, rows: [] };
    },
    release: () => { released = true; },
  };
  return {
    pool: { connect: async () => tx } as unknown as PostgresPool,
    queries, released: () => released,
  };
}

describe("Meta webhook durable reconciliation boundary", () => {
  it("derives binding from verified account before calling scoped event writer", async () => {
    const fake = poolMock();
    await applyMetaEvents(fake.pool, [event], env);
    const recorded = fake.queries.find((q) => q.text.includes("outbound_record_provider_event"));
    expect(recorded?.params?.[0]).toBe("e640f743-e9ec-4ca5-a48e-a6c5cbf46574");
    expect(recorded?.params?.[3]).toMatch(/^hmac:v1:[A-Za-z0-9_-]{43}$/);
    expect(recorded?.params).not.toContain(event.recipientId);
    expect(fake.queries.at(-1)?.text).toBe("COMMIT");
    expect(fake.released()).toBe(true);
  });

  it("does not attach unknown foreign account by phone alone", async () => {
    const fake = poolMock(false);
    await applyMetaEvents(fake.pool, [event], env);
    expect(fake.queries.filter((q) => q.text.includes("outbound_record_provider_event")))
      .toHaveLength(0);
  });

  it("never ACKs a failed database event transaction", async () => {
    const fake = poolMock(true, true);
    await expect(applyMetaEvents(fake.pool, [event], env)).rejects.toThrow("DB_FAIL");
    expect(fake.queries.at(-1)?.text).toBe("ROLLBACK");
    expect(fake.released()).toBe(true);
  });

  it("rejects missing key and disabled mode instead of accepting a callback", async () => {
    const fake = poolMock();
    await expect(applyMetaEvents(fake.pool, [event], {
      ...env, OUTBOUND_MESSAGING_MODE: "disabled",
    })).rejects.toThrow("META_WEBHOOK_NOT_CONFIGURED");
    expect(fake.queries).toHaveLength(0);
  });
});
