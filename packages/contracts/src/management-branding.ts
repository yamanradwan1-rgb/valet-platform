import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const primaryColorSchema = z.string().regex(/^#[0-9A-F]{6}$/);

export const managementBrandingSettingSchema = z.enum([
  "brandDisplayName",
  "brandPrimaryColor",
]);

const displayNameSchema = z.string().transform((value) => value.trim())
  .refine((value) => value.length > 0)
  .refine((value) => Array.from(value).length <= 120)
  .refine((value) => !/\p{Cc}/u.test(value));

export const managementBrandingSetRequestSchema = z.discriminatedUnion("setting", [
  z.object({
    setting: z.literal("brandDisplayName"),
    value: displayNameSchema,
    expectedUpdatedAt: timestampSchema,
  }).strict(),
  z.object({
    setting: z.literal("brandPrimaryColor"),
    value: primaryColorSchema,
    expectedUpdatedAt: timestampSchema,
  }).strict(),
]);

export const managementBrandingClearRequestSchema = z.object({
  setting: managementBrandingSettingSchema,
  expectedUpdatedAt: timestampSchema,
}).strict();

export const managementCompanyBrandingResponseSchema = z.object({
  organizationId: uuidSchema,
  updatedAt: timestampSchema,
  displayName: displayNameSchema,
  primaryColor: primaryColorSchema,
}).strict();

const inheritedBranding = (schema: z.ZodTypeAny) => z.object({
  default: schema,
  overridePresent: z.boolean(),
  override: schema.nullable(),
  effective: schema,
}).strict();

export const managementLocationBrandingResponseSchema = z.object({
  organizationId: uuidSchema,
  locationId: uuidSchema,
  updatedAt: timestampSchema,
  displayName: inheritedBranding(displayNameSchema),
  primaryColor: inheritedBranding(primaryColorSchema),
}).strict();

export type ManagementBrandingSetRequest = z.infer<typeof managementBrandingSetRequestSchema>;
export type ManagementBrandingClearRequest = z.infer<typeof managementBrandingClearRequestSchema>;
export type ManagementCompanyBrandingResponse = z.infer<typeof managementCompanyBrandingResponseSchema>;
export type ManagementLocationBrandingResponse = z.infer<typeof managementLocationBrandingResponseSchema>;
