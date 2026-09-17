import { z } from "zod";

const uuidSchema = z.string().uuid();
const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{8,512}$/);

export const managementCapabilitySchema = z.enum([
  "COMPANY_DASHBOARD_READ",
  "LOCATION_DASHBOARD_READ",
  "ANALYTICS_READ",
  "REPORTS_READ",
  "REPORT_EXPORT",
  "LIVE_MAP_READ",
  "STAFF_MANAGE_ELIGIBLE",
  "COMPANY_SETTINGS_MANAGE_ELIGIBLE",
  "LOCATION_SETTINGS_MANAGE_ELIGIBLE",
  "BRANDING_MANAGE_ELIGIBLE",
  "LOCATION_LIFECYCLE_MANAGE_ELIGIBLE",
  "TENANT_AUDIT_READ_ELIGIBLE",
  "VISIT_CONTACT_READ_ELIGIBLE",
  "VISIT_CONTACT_CORRECT_ELIGIBLE",
  "ALL_LOCATIONS_SCOPE_SELECT",
]);

export const managementScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LOCATION"), locationId: uuidSchema }).strict(),
  z.object({ kind: z.literal("ALL_LOCATIONS") }).strict(),
]);

export const managementListQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const managementContextQuerySchema = z
  .object({
    scopeKind: z.enum(["LOCATION", "ALL_LOCATIONS"]),
    locationId: uuidSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.scopeKind === "LOCATION" && value.locationId === undefined) ||
      (value.scopeKind === "ALL_LOCATIONS" && value.locationId !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid management scope.",
      });
    }
  });

export const managementOrganizationSchema = z
  .object({
    organizationId: uuidSchema,
    name: z.string().min(1).max(200),
    timezone: z.string().min(1).max(255),
  })
  .strict();

export const managementLocationSchema = z
  .object({
    locationId: uuidSchema,
    name: z.string().min(1).max(200),
    code: z.string().min(1).max(100),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    timezone: z.string().min(1).max(255),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

export const managementOrganizationsResponseSchema = z
  .object({
    items: z.array(managementOrganizationSchema).max(100),
    nextCursor: cursorSchema.nullable(),
  })
  .strict();

export const managementLocationsResponseSchema = z
  .object({
    items: z.array(managementLocationSchema).max(100),
    nextCursor: cursorSchema.nullable(),
  })
  .strict();

export const managementContextResponseSchema = z
  .object({
    organization: managementOrganizationSchema,
    scope: managementScopeSchema,
    selectedLocation: managementLocationSchema.nullable(),
    capabilities: z.array(managementCapabilitySchema).max(32),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope.kind === "ALL_LOCATIONS") {
      if (value.selectedLocation !== null) {
        context.addIssue({
          code: "custom",
          message: "Invalid selected location.",
        });
      }
      return;
    }
    if (
      value.selectedLocation === null ||
      value.selectedLocation.locationId !== value.scope.locationId
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid selected location.",
      });
    }
  });

export type ManagementCapability = z.infer<typeof managementCapabilitySchema>;
export type ManagementScope = z.infer<typeof managementScopeSchema>;
export type ManagementListQuery = z.infer<typeof managementListQuerySchema>;
export type ManagementContextQuery = z.infer<
  typeof managementContextQuerySchema
>;
export type ManagementOrganization = z.infer<
  typeof managementOrganizationSchema
>;
export type ManagementLocation = z.infer<typeof managementLocationSchema>;
export type ManagementOrganizationsResponse = z.infer<
  typeof managementOrganizationsResponseSchema
>;
export type ManagementLocationsResponse = z.infer<
  typeof managementLocationsResponseSchema
>;
export type ManagementContextResponse = z.infer<
  typeof managementContextResponseSchema
>;
