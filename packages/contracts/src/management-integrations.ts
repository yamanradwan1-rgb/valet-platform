import { z } from "zod";

const uuidSchema = z.string().uuid();

export const managementIntegrationKeySchema = z.enum([
  "PLATE_OCR",
  "STAFF_PUSH",
  "DIGITAL_PAYMENT",
]);

export const managementIntegrationStatusSchema = z.enum([
  "DISABLED",
  "UNAVAILABLE",
  "MISCONFIGURED",
  "DEGRADED",
  "OPERATIONAL",
  "UNKNOWN",
]);

const integration = (key: "PLATE_OCR" | "STAFF_PUSH" | "DIGITAL_PAYMENT") =>
  z
    .object({
      key: z.literal(key),
      status: managementIntegrationStatusSchema,
    })
    .strict();

export const managementIntegrationsResponseSchema = z
  .object({
    organizationId: uuidSchema,
    integrations: z.tuple([
      integration("PLATE_OCR"),
      integration("STAFF_PUSH"),
      integration("DIGITAL_PAYMENT"),
    ]),
  })
  .strict();

export type ManagementIntegrationKey = z.infer<
  typeof managementIntegrationKeySchema
>;
export type ManagementIntegrationStatus = z.infer<
  typeof managementIntegrationStatusSchema
>;
export type ManagementIntegrationsResponse = z.infer<
  typeof managementIntegrationsResponseSchema
>;
