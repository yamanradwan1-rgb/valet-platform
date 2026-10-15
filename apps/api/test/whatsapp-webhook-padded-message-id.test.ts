import { describe, expect, it } from "vitest";
import { normalizeMetaStatusPayload } from "../src/modules/notifications/webhooks/meta-webhook-events";

function callback(id: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "123456789",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "987654321" },
          statuses: [{
            id, recipient_id: "962790000001", status: "delivered",
            timestamp: "1792100000",
          }],
        },
      }],
    }],
  };
}

describe("Meta signed delivery identifiers with Base64 padding", () => {
  it("accepts bounded, padded wamid while preserving stored correlation key", () => {
    const id = "wamid.HBgMMzU5ODgzNDk1NTgzFQIAERgSRDFEQzIyRDU0NUE4MzVCQzkyAA==";
    const statuses = normalizeMetaStatusPayload(callback(id));
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      providerMessageId: id, status: "DELIVERED",
      wabaId: "123456789", phoneNumberId: "987654321",
    });
    expect(normalizeMetaStatusPayload(callback("wamid.A+/=="))[0]?.providerMessageId)
      .toBe("wamid.A+/==");
  });

  it("continues to reject controls, separators and oversized provider identifiers", () => {
    for (const id of ["wamid.invalid token", "wamid.x\ninvalid", "bad/x/unsafe", "wamid.A=B",
      "wamid." + "A".repeat(252)]) {
      expect(() => normalizeMetaStatusPayload(callback(id))).toThrow(
        "META_WEBHOOK_INVALID",
      );
    }
  });
});
