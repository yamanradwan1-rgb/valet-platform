import { createHash, createHmac } from "node:crypto";
import type { PostgresPool, PostgresTransaction } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import type { MetaWebhookStatus } from "./meta-webhook-events";

function digestFactory(env: NodeJS.ProcessEnv) {
  const keyBase64 = env.OUTBOUND_RECIPIENT_HMAC_KEY_BASE64;
  const version = env.OUTBOUND_RECIPIENT_HMAC_KEY_VERSION;
  if (!keyBase64 || !/^v[0-9]+$/.test(version ?? "")) return null;
  const key = Buffer.from(keyBase64, "base64");
  if (key.length < 32 || key.toString("base64") !== keyBase64) return null;
  return (phone: string) => `hmac:${version}:${createHmac("sha256", key)
    .update(phone, "utf8").digest("base64url")}`;
}

/** Webhook may only infer a tenant through the database's persisted sender binding. */
export async function applyMetaEvents(
  pool: PostgresPool,
  events: readonly MetaWebhookStatus[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const digest = digestFactory(env);
  const mode = env.OUTBOUND_MESSAGING_MODE;
  if (!digest || (mode !== "test" && mode !== "production")) {
    throw new Error("META_WEBHOOK_NOT_CONFIGURED");
  }
  await inPostgresTransaction(pool, async (tx: PostgresTransaction) => {
    for (const event of events) {
      const binding = await tx.query<{ bindingId: string }>(
        `SELECT binding_id::text AS "bindingId"
         FROM outbound_resolve_meta_binding($1,$2,$3)`,
        [event.wabaId, event.phoneNumberId, mode],
      );
      const id = binding.rows[0]?.bindingId;
      if (!id) continue;
      const handle = event.attemptHandle &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
          .test(event.attemptHandle) ? event.attemptHandle : null;
      const recipientDigest = digest(`+${event.recipientId}`);
      const identity = JSON.stringify([
        id, event.providerMessageId, event.status,
        event.providerTime.toISOString(), handle, recipientDigest,
        event.safeErrorClass ?? null,
      ]);
      const dedupe = createHash("sha256").update(identity).digest("hex");
      await tx.query(
        `SELECT outbound_record_provider_event(
          $1::uuid,$2::uuid,$3::text,$4::text,$5::text,
          $6::timestamptz,$7::text,$8::text)`,
        [id, handle, event.providerMessageId, recipientDigest,
          event.status, event.providerTime, dedupe, event.safeErrorClass ?? null],
      );
    }
  });
}
