import { z } from "zod";

export const webPushPresentationTypeSchema = z.enum([
  "EMPLOYEE_RETRIEVAL_REQUESTED",
  "GUEST_VEHICLE_READY",
]);
export const webPushAudienceSchema = z.enum(["EMPLOYEE", "GUEST"]);
export const webPushLocaleSchema = z.enum(["en", "ar"]);

export const webPushEncryptedValueSchema = z
  .object({
    authTag: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
    ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/),
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    keyVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    version: z.literal(1),
  })
  .strict();

export class WebPushEncryptedValueParseError extends Error {
  constructor() {
    super("Persisted Web Push credential envelope is invalid.");
    this.name = "WebPushEncryptedValueParseError";
  }
}

export function serializeWebPushEncryptedValue(
  value: WebPushEncryptedValue,
): string {
  try {
    const parsed = webPushEncryptedValueSchema.parse(value);
    return JSON.stringify({
      version: parsed.version,
      keyVersion: parsed.keyVersion,
      iv: parsed.iv,
      authTag: parsed.authTag,
      ciphertext: parsed.ciphertext,
    });
  } catch {
    throw new WebPushEncryptedValueParseError();
  }
}

export function parseWebPushEncryptedValue(
  serialized: string,
): WebPushEncryptedValue {
  try {
    const parsed = webPushEncryptedValueSchema.parse(JSON.parse(serialized));
    if (serializeWebPushEncryptedValue(parsed) !== serialized) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new WebPushEncryptedValueParseError();
  }
}

export type WebPushAudience = z.infer<typeof webPushAudienceSchema>;
export type WebPushEncryptedValue = z.infer<typeof webPushEncryptedValueSchema>;
export type WebPushLocale = z.infer<typeof webPushLocaleSchema>;
export type WebPushPresentationType = z.infer<
  typeof webPushPresentationTypeSchema
>;
