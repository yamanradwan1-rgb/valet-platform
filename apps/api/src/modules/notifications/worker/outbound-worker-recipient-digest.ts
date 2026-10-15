import { createHmac } from "node:crypto";

export function senderRecipientDigestFromEnv(env: NodeJS.ProcessEnv): (phone: string) => string {
  const encoded = env.OUTBOUND_RECIPIENT_HMAC_KEY_BASE64;
  const version = env.OUTBOUND_RECIPIENT_HMAC_KEY_VERSION;
  if (!encoded || !version || !/^v[0-9]+$/.test(version)) {
    throw new Error("OUTBOUND_SENDER_DIGEST_KEY_NOT_READY");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length < 32 || key.toString("base64") !== encoded) {
    throw new Error("OUTBOUND_SENDER_DIGEST_KEY_INVALID");
  }
  return (phone: string): string => {
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      throw new Error("OUTBOUND_SENDER_RECIPIENT_INVALID");
    }
    return `hmac:${version}:${createHmac("sha256", key)
      .update(phone, "utf8").digest("base64url")}`;
  };
}
