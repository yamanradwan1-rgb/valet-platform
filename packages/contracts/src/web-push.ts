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

export type WebPushAudience = z.infer<typeof webPushAudienceSchema>;
export type WebPushEncryptedValue = z.infer<typeof webPushEncryptedValueSchema>;
export type WebPushLocale = z.infer<typeof webPushLocaleSchema>;
export type WebPushPresentationType = z.infer<
  typeof webPushPresentationTypeSchema
>;
