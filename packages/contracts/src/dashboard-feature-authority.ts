import { z } from "zod";

const uuidSchema = z.string().uuid();

export const dashboardFeatureAuthorityFeatureSchema = z.enum([
  "VISIT_CONTACTS",
  "MANAGEMENT_AUDIT",
]);

export const dashboardFeatureAuthorityQuerySchema = z
  .object({
    feature: dashboardFeatureAuthorityFeatureSchema,
    locationId: uuidSchema.optional(),
    organizationId: uuidSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.feature === "VISIT_CONTACTS" && value.locationId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Visit Contacts authority is Organization-scoped.",
      });
    }
  });

export const dashboardFeatureAuthorityScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ORGANIZATION") }).strict(),
  z.object({ kind: z.literal("ORGANIZATION_GRANT_SET") }).strict(),
  z.object({ kind: z.literal("LOCATION"), locationId: uuidSchema }).strict(),
]);

export const dashboardFeatureAuthorityResponseSchema = z
  .object({
    feature: dashboardFeatureAuthorityFeatureSchema,
    organizationId: uuidSchema,
    role: z.enum(["ORG_ADMIN", "LOCATION_MANAGER", "VALET_SUPERVISOR"]),
    scope: dashboardFeatureAuthorityScopeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const visitContacts = value.feature === "VISIT_CONTACTS";
    const validVisitContacts =
      (value.role === "ORG_ADMIN" && value.scope.kind === "ORGANIZATION") ||
      (value.role === "LOCATION_MANAGER" &&
        value.scope.kind === "ORGANIZATION_GRANT_SET");
    const validAudit =
      value.feature === "MANAGEMENT_AUDIT" &&
      ((value.role === "ORG_ADMIN" && value.scope.kind === "ORGANIZATION") ||
        value.scope.kind === "LOCATION");
    if ((visitContacts && !validVisitContacts) || (!visitContacts && !validAudit)) {
      context.addIssue({ code: "custom", message: "Invalid feature authority projection." });
    }
  });

export type DashboardFeatureAuthorityFeature = z.infer<
  typeof dashboardFeatureAuthorityFeatureSchema
>;
export type DashboardFeatureAuthorityQuery = z.infer<
  typeof dashboardFeatureAuthorityQuerySchema
>;
export type DashboardFeatureAuthorityResponse = z.infer<
  typeof dashboardFeatureAuthorityResponseSchema
>;
