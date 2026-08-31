import { z } from "zod";

export const webPushPresentationTypeSchema = z.enum([
  "EMPLOYEE_RETRIEVAL_REQUESTED",
  "GUEST_VEHICLE_READY",
]);
export const webPushAudienceSchema = z.enum(["EMPLOYEE", "GUEST"]);
export const webPushLocaleSchema = z.enum(["en", "ar"]);

const employeePayloadSchema = z
  .object({
    audience: z.literal("EMPLOYEE"),
    body: z.string().min(1).max(160),
    direction: z.enum(["ltr", "rtl"]),
    identity: z.string().uuid(),
    locale: webPushLocaleSchema,
    presentationType: z.literal("EMPLOYEE_RETRIEVAL_REQUESTED"),
    route: z.literal("TASKS"),
    title: z.string().min(1).max(80),
    version: z.literal(1),
  })
  .strict();

const guestPayloadSchema = z
  .object({
    audience: z.literal("GUEST"),
    body: z.string().min(1).max(160),
    direction: z.enum(["ltr", "rtl"]),
    identity: z
      .string()
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i,
      ),
    locale: webPushLocaleSchema,
    presentationType: z.literal("GUEST_VEHICLE_READY"),
    route: z.literal("GUEST_HOME"),
    title: z.string().min(1).max(80),
    version: z.literal(1),
  })
  .strict();

export const webPushPayloadSchema = z
  .discriminatedUnion("presentationType", [
    employeePayloadSchema,
    guestPayloadSchema,
  ])
  .superRefine((payload, context) => {
    const expectedDirection = payload.locale === "ar" ? "rtl" : "ltr";
    if (payload.direction !== expectedDirection) {
      context.addIssue({
        code: "custom",
        message: "Web Push locale and direction do not match.",
        path: ["direction"],
      });
    }
  });

const canonicalBase64UrlTail = "AEIMQUYcgkosw048";
const webPushAuthSchema = z
  .string()
  .regex(new RegExp(`^[A-Za-z0-9_-]{21}[${canonicalBase64UrlTail}]$`));
const webPushP256dhSchema = z
  .string()
  .regex(new RegExp(`^B[A-P][A-Za-z0-9_-]{84}[${canonicalBase64UrlTail}]$`));

export const webPushSubscriptionRequestSchema = z
  .object({
    auth: webPushAuthSchema,
    browserExpiresAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    endpoint: z
      .string()
      .url()
      .max(4096)
      .refine((value) => {
        const parsed = new URL(value);
        return (
          parsed.protocol === "https:" &&
          parsed.username === "" &&
          parsed.password === "" &&
          parsed.hash === ""
        );
      }),
    locale: webPushLocaleSchema,
    p256dh: webPushP256dhSchema,
  })
  .strict();

export const webPushSubscriptionResponseSchema = z
  .object({
    audience: webPushAudienceSchema,
    browserExpiresAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    locale: webPushLocaleSchema,
    status: z.enum(["ACTIVE", "DISABLED"]),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

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
export type WebPushPayload = z.infer<typeof webPushPayloadSchema>;
export type WebPushSubscriptionRequest = z.infer<
  typeof webPushSubscriptionRequestSchema
>;
export type WebPushSubscriptionResponse = z.infer<
  typeof webPushSubscriptionResponseSchema
>;
