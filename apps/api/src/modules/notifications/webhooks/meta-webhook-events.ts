export interface MetaWebhookStatus {
  readonly wabaId: string;
  readonly phoneNumberId: string;
  readonly providerMessageId: string;
  readonly recipientId: string;
  readonly status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  readonly providerTime: Date;
  readonly attemptHandle?: string;
  readonly safeErrorClass?: "PROVIDER";
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function narrowId(value: unknown, max = 160, allowBase64Padding = false): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    (/^[a-zA-Z0-9._:-]+$/.test(value) ||
      (allowBase64Padding && /^wamid\.[A-Za-z0-9._:+/-]{1,249}={0,2}$/
        .test(value))) ? value : null;
}

/** Strictly bounded Meta status subset; never logs or saves the original payload. */
export function normalizeMetaStatusPayload(payload: unknown): readonly MetaWebhookStatus[] {
  const document = object(payload);
  if (!document || document.object !== "whatsapp_business_account" ||
      !Array.isArray(document.entry) || document.entry.length > 16) {
    throw new Error("META_WEBHOOK_INVALID");
  }
  const statuses: MetaWebhookStatus[] = [];
  for (const entryValue of document.entry) {
    const entry = object(entryValue);
    const wabaId = narrowId(entry?.id);
    if (!entry || !wabaId || !Array.isArray(entry.changes) ||
        entry.changes.length > 16) throw new Error("META_WEBHOOK_INVALID");
    for (const changeValue of entry.changes) {
      const change = object(changeValue);
      if (!change || change.field !== "messages") continue;
      const value = object(change.value);
      // A signed messages callback may be an inbound message with no delivery
      // statuses. Ignore it as non-delivery evidence, without persisting its
      // text, and leave opt-out ingestion to the separately approved policy.
      if (value && !("statuses" in value) && Array.isArray(value.messages) &&
          value.messages.length <= 64) continue;
      const metadata = object(value?.metadata);
      const phoneNumberId = narrowId(metadata?.phone_number_id);
      if (!phoneNumberId || !Array.isArray(value?.statuses) ||
          value.statuses.length > 64) throw new Error("META_WEBHOOK_INVALID");
      for (const statusValue of value.statuses) {
        if (statuses.length >= 128) throw new Error("META_WEBHOOK_INVALID");
        const status = object(statusValue);
        // Real Meta wamid values may end in base64 '=' padding. Keep every
        // other authority identifier strict and retain the existing bound.
        const id = narrowId(status?.id, 255, true);
        const recipient = narrowId(status?.recipient_id, 32);
        const kind = status?.status;
        const stamp = status?.timestamp;
        const seconds = typeof stamp === "string" && /^[0-9]{10,11}$/.test(stamp)
          ? Number(stamp) : NaN;
        if (!id || !recipient || !/^[0-9]{6,20}$/.test(recipient) ||
          !["sent", "delivered", "read", "failed"].includes(String(kind)) ||
          !Number.isSafeInteger(seconds) || seconds < 1) {
          throw new Error("META_WEBHOOK_INVALID");
        }
        const handle = narrowId(status?.biz_opaque_callback_data, 128);
        statuses.push({
          wabaId, phoneNumberId, providerMessageId: id, recipientId: recipient,
          status: String(kind).toUpperCase() as MetaWebhookStatus["status"],
          providerTime: new Date(seconds * 1000),
          ...(handle ? { attemptHandle: handle } : {}),
          ...(kind === "failed" ? { safeErrorClass: "PROVIDER" as const } : {}),
        });
      }
    }
  }
  return statuses;
}
