import { z } from "zod";

import { locationMapAreaPurposeSchema } from "./map-setup.js";

const uuidSchema = z.string().uuid();

export const liveOperationsMapQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

const liveMapAreaSchema = z
  .object({
    code: z.string(),
    label: z.string(),
    levelLabel: z.string().nullable(),
    mapAreaId: uuidSchema,
    parkingZoneId: uuidSchema.nullable(),
    purpose: locationMapAreaPurposeSchema,
  })
  .strict();

const liveMapPositionSchema = z
  .object({
    areas: z.array(liveMapAreaSchema),
    capturedAt: z.string().datetime({ offset: true }),
    freshness: z.enum(["LIVE", "STALE"]),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

const liveMapVehicleSchema = z
  .object({
    color: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    plateCountry: z.string().nullable(),
    plateNumber: z.string().nullable(),
    temporaryDescriptor: z.string().nullable(),
    vehicleId: uuidSchema,
  })
  .strict();

export const liveOperationsMapResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            assigneeMembershipId: uuidSchema,
            position: liveMapPositionSchema.nullable(),
            sessionState: z.enum(["PARKING", "RETRIEVING"]),
            taskId: uuidSchema,
            taskType: z.enum(["PARKING", "RETRIEVAL"]),
            trackingSessionId: uuidSchema,
            valetSessionId: uuidSchema,
            vehicle: liveMapVehicleSchema,
          })
          .strict(),
      )
      .max(500),
    nextCursor: z.string().min(1).max(512).nullable(),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type LiveOperationsMapQuery = z.infer<
  typeof liveOperationsMapQuerySchema
>;
export type LiveOperationsMapResponse = z.infer<
  typeof liveOperationsMapResponseSchema
>;
