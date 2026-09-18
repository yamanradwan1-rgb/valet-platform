import { z } from "zod";

import { subscriptionStateSchema } from "./location-subscription.js";

const uuidSchema = z.string().uuid();

export const managementSubscriptionResponseSchema = z
  .object({
    organizationId: uuidSchema,
    subscription: subscriptionStateSchema.nullable(),
  })
  .strict();

export type ManagementSubscriptionResponse = z.infer<
  typeof managementSubscriptionResponseSchema
>;
