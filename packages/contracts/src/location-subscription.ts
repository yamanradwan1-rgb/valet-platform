import { z } from "zod";

const uuidSchema = z.string().uuid();

export const subscriptionStatusSchema = z.enum([
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionEntitlementsSchema = z
  .object({
    dashboardAccess: z.boolean(),
    reportExports: z.boolean(),
    basicBranding: z.boolean(),
  })
  .strict();
export type SubscriptionEntitlements = z.infer<
  typeof subscriptionEntitlementsSchema
>;

export const subscriptionStateSchema = z
  .object({
    planCode: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/),
    status: subscriptionStatusSchema,
    entitlements: subscriptionEntitlementsSchema,
  })
  .strict();
export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;

export const locationSubscriptionResponseSchema = z
  .object({
    organizationId: uuidSchema,
    locationId: uuidSchema,
    subscription: subscriptionStateSchema.nullable(),
  })
  .strict();
export type LocationSubscriptionResponse = z.infer<
  typeof locationSubscriptionResponseSchema
>;
