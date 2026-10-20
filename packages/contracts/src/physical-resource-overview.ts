import { z } from "zod";
import {
  parkingSpotListEntrySchema,
  physicalResourceCodeSchema,
  physicalResourceListQuerySchema,
  physicalResourceStatusSchema,
} from "./physical-resource-configuration.js";
import { resourceVehicleIdentitySchema } from "./resource-vehicle-identity.js";

const uuid = z.string().uuid();
const cursor = physicalResourceListQuerySchema.shape.cursor;
export const physicalResourceUsageFilterSchema = z.enum([
  "all",
  "busy",
  "available",
  "inactive",
]);

export const physicalResourceOverviewQuerySchema = z
  .object({
    limit: physicalResourceListQuerySchema.shape.limit,
    keyCursor: cursor,
    spotCursor: cursor,
    keyFilter: physicalResourceUsageFilterSchema.optional(),
    spotFilter: physicalResourceUsageFilterSchema.optional(),
  })
  .strict();

export const physicalResourceKeyOverviewSchema = z
  .object({
    keySlotId: uuid,
    code: physicalResourceCodeSchema,
    status: physicalResourceStatusSchema,
    label: z.string().trim().min(1).max(160).nullable(),
    usage: z.enum(["AVAILABLE", "IN_USE", "UNKNOWN"]),
    holdingSessionId: uuid.nullable(),
    holdingVehicle: resourceVehicleIdentitySchema.nullable(),
  })
  .strict()
  .refine(
    (row) => (row.holdingSessionId === null) === (row.holdingVehicle === null),
    { message: "Current holder and vehicle must agree." },
  )
  .refine((row) => row.usage !== "AVAILABLE" || row.holdingSessionId === null, {
    message: "An available slot cannot hold a session.",
  });

export const physicalResourceSpotOverviewSchema =
  parkingSpotListEntrySchema.extend({
    usage: z.enum(["AVAILABLE", "OCCUPIED", "UNKNOWN"]),
  });

const nonNegative = z.number().int().nonnegative();
const keyCounts = z
  .object({
    configured: nonNegative,
    active: nonNegative,
    available: nonNegative.nullable(),
    inUse: nonNegative.nullable(),
    unknown: nonNegative,
  })
  .strict();
const spotCounts = z
  .object({
    configured: nonNegative,
    active: nonNegative,
    available: nonNegative.nullable(),
    occupied: nonNegative.nullable(),
    unknown: nonNegative,
  })
  .strict();

export const physicalResourceOverviewResponseSchema = z
  .object({
    counts: z
      .object({
        keySlots: keyCounts,
        parkingSpots: spotCounts,
      })
      .strict(),
    keySlots: z
      .object({
        items: z.array(physicalResourceKeyOverviewSchema).max(100),
        nextCursor: cursor.nullable(),
      })
      .strict(),
    parkingSpots: z
      .object({
        items: z.array(physicalResourceSpotOverviewSchema).max(100),
        nextCursor: cursor.nullable(),
      })
      .strict(),
  })
  .strict();

export const physicalResourceCustodyQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const physicalResourceCustodyResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            eventId: uuid,
            eventType: z.enum([
              "SLOT_ASSIGNED",
              "CHECKED_OUT",
              "RETURNED_TO_SLOT",
              "SLOT_CLEARED",
              "RELEASED",
            ]),
            occurredAt: z.string().datetime({ offset: true }),
            actorMembershipId: uuid,
            actorName: z.string().nullable(),
          })
          .strict(),
      )
      .max(50),
    hasMore: z.boolean(),
  })
  .strict();

export type PhysicalResourceOverviewQuery = z.infer<
  typeof physicalResourceOverviewQuerySchema
>;
export type PhysicalResourceUsageFilter = z.infer<
  typeof physicalResourceUsageFilterSchema
>;
export type PhysicalResourceOverviewResponse = z.infer<
  typeof physicalResourceOverviewResponseSchema
>;
export type PhysicalResourceCustodyQuery = z.infer<
  typeof physicalResourceCustodyQuerySchema
>;
export type PhysicalResourceCustodyResponse = z.infer<
  typeof physicalResourceCustodyResponseSchema
>;
