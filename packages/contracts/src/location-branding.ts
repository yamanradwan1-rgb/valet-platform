import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

export const brandingSettingSchema = z.enum([
  "brandDisplayName",
  "brandPrimaryColor",
]);
export type BrandingSetting = z.infer<typeof brandingSettingSchema>;

const hexColorSchema = z.string().regex(/^#[0-9A-F]{6}$/);

function displayNameValue() {
  return z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length >= 1)
    .refine((value) => Array.from(value).length <= 120)
    .refine((value) => !/\p{Cc}/u.test(value));
}

export const brandingSetRequestSchema = z.discriminatedUnion("setting", [
  z
    .object({
      setting: z.literal("brandDisplayName"),
      value: displayNameValue(),
      expectedUpdatedAt: timestampSchema,
    })
    .strict(),
  z
    .object({
      setting: z.literal("brandPrimaryColor"),
      value: hexColorSchema,
      expectedUpdatedAt: timestampSchema,
    })
    .strict(),
]);
export type BrandingSetRequest = z.infer<typeof brandingSetRequestSchema>;

export const brandingClearRequestSchema = z
  .object({
    setting: brandingSettingSchema,
    expectedUpdatedAt: timestampSchema,
  })
  .strict();
export type BrandingClearRequest = z.infer<typeof brandingClearRequestSchema>;

const brandingSettingProjectionSchema = z.object({
  default: z.string(),
  overridePresent: z.boolean(),
  override: z.string().nullable(),
  effective: z.string(),
});

export const brandingReadResponseSchema = z
  .object({
    locationId: uuidSchema,
    updatedAt: timestampSchema,
    displayName: brandingSettingProjectionSchema,
    primaryColor: brandingSettingProjectionSchema,
  })
  .strict();
export type BrandingReadResponse = z.infer<typeof brandingReadResponseSchema>;
