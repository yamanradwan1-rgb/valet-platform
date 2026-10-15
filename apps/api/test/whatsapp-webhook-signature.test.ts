import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_META_WEBHOOK_BYTES, verifyMetaSignature, verifyMetaSubscription,
} from "../src/modules/notifications/webhooks/meta-webhook-signature";
import { normalizeMetaStatusPayload } from "../src/modules/notifications/webhooks/meta-webhook-events";

const secret = "synthetic-testing-app-secret-do-not-use";
const bytes = Buffer.from('{ "object": "whatsapp_business_account", "entry": [] }');
const signature = "sha256=" + createHmac("sha256", secret).update(bytes).digest("hex");

describe("Meta webhook trust boundary", () => {
  it("authenticates exact raw bytes before parsing", () => {
    expect(verifyMetaSignature(bytes, signature, secret)).toBe(true);
    const altered = Buffer.from(bytes.toString().replace(", ", ",  "));
    expect(altered.equals(bytes)).toBe(false);
    expect(verifyMetaSignature(altered, signature, secret)).toBe(false);
    expect(verifyMetaSignature(Buffer.concat([bytes, Buffer.from(" ")]), signature, secret)).toBe(false);
    expect(verifyMetaSignature(bytes, signature.toUpperCase(), secret)).toBe(false);
    expect(verifyMetaSignature(bytes, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(bytes, signature, undefined)).toBe(false);
    expect(verifyMetaSignature(Buffer.alloc(MAX_META_WEBHOOK_BYTES + 1), signature, secret)).toBe(false);
  });

  it("requires bounded verified subscribe challenge", () => {
    expect(verifyMetaSubscription("subscribe", "token-synthetic-very-long", "123",
      "token-synthetic-very-long")).toBe("123");
    expect(verifyMetaSubscription("subscribe", "wrong", "123",
      "token-synthetic-very-long")).toBeNull();
    expect(verifyMetaSubscription("subscribe", "token-synthetic-very-long", "injected\n",
      "token-synthetic-very-long")).toBeNull();
  });

  it("normalizes only authenticated bounded status evidence", () => {
    const payload = { object: "whatsapp_business_account", entry: [{
      id: "waba_1", changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "12345" },
        statuses: [{ id: "wamid.test", recipient_id: "962790000000",
          status: "delivered", timestamp: "1792100000" }],
      } }],
    }] };
    expect(normalizeMetaStatusPayload(payload)).toMatchObject([{
      wabaId: "waba_1", phoneNumberId: "12345",
      providerMessageId: "wamid.test", status: "DELIVERED",
    }]);
    expect(() => normalizeMetaStatusPayload({ ...payload, entry: [{}] }))
      .toThrow("META_WEBHOOK_INVALID");
    expect(normalizeMetaStatusPayload({
      object: "whatsapp_business_account",
      entry: [{ id: "waba_1", changes: [{
        field: "messages", value: {
          metadata: { phone_number_id: "12345" },
          messages: [{ id: "wamid.inbound", text: { body: "private" } }],
        },
      }] }],
    })).toEqual([]);
  });
});
