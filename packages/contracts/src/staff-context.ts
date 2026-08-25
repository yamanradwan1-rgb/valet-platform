import { z } from "zod";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });

export const staffOperationalRoleSchema = z.enum([
  "VALET_EMPLOYEE",
  "VALET_SUPERVISOR",
]);

export const staffOperationalLocationSchema = z
  .object({
    code: z.string(),
    // Authoritative Location currency (ISO 4217), server-derived per exact
    // Location. Additive projection for Employee cash-entry UX (DEC-052).
    currency: z.string().regex(/^[A-Z]{3}$/),
    locationId: uuidSchema,
    name: z.string(),
  })
  .strict();

export const staffOperationalShiftSchema = z
  .object({
    locationId: uuidSchema,
    shiftId: uuidSchema,
    startedAt: utcTimestampSchema,
    status: z.literal("ACTIVE"),
  })
  .strict();

export const staffOperationalOrganizationSchema = z
  .object({
    name: z.string(),
    organizationId: uuidSchema,
  })
  .strict();

export const staffOperationalMembershipContextSchema = z
  .object({
    activeShift: staffOperationalShiftSchema.nullable(),
    currentLocation: staffOperationalLocationSchema.nullable(),
    eligibleLocations: z.array(staffOperationalLocationSchema),
    membershipId: uuidSchema,
    organization: staffOperationalOrganizationSchema,
    role: staffOperationalRoleSchema,
  })
  .strict();

export const staffOperationalContextResponseSchema = z
  .object({
    contexts: z.array(staffOperationalMembershipContextSchema),
  })
  .strict();

export type StaffOperationalRole = z.infer<typeof staffOperationalRoleSchema>;
export type StaffOperationalLocation = z.infer<
  typeof staffOperationalLocationSchema
>;
export type StaffOperationalShift = z.infer<typeof staffOperationalShiftSchema>;
export type StaffOperationalOrganization = z.infer<
  typeof staffOperationalOrganizationSchema
>;
export type StaffOperationalMembershipContext = z.infer<
  typeof staffOperationalMembershipContextSchema
>;
export type StaffOperationalContextResponse = z.infer<
  typeof staffOperationalContextResponseSchema
>;
