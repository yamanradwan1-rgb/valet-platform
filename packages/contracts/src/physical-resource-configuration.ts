import { z } from "zod";
import { dashboardSessionStateSchema } from "./location-overview.js";
import { resourceVehicleIdentitySchema } from "./resource-vehicle-identity.js";

const uuidSchema = z.string().uuid();
const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{8,512}$/);
const timestampSchema = z.string().datetime({ offset: true });

export const physicalResourceCodeSchema = z.string().trim().min(1).max(100);
export const parkingSpotLabelSchema = z.string().trim().min(1).max(160);
export const physicalResourceStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const physicalResourceListQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const keySlotConfigurationSchema = z
  .object({
    keySlotId: uuidSchema,
    code: physicalResourceCodeSchema,
    status: physicalResourceStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const parkingZoneSelectorSchema = z
  .object({
    parkingZoneId: uuidSchema,
    code: z.string().min(1),
    label: z.string().min(1),
    status: physicalResourceStatusSchema,
  })
  .strict();

export const parkingSpotConfigurationSchema = z
  .object({
    parkingSpotId: uuidSchema,
    code: physicalResourceCodeSchema,
    label: parkingSpotLabelSchema,
    status: physicalResourceStatusSchema,
    parkingZone: parkingZoneSelectorSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const parkingSpotOccupancySchema = z
  .object({
    sessionId: uuidSchema,
    sessionState: dashboardSessionStateSchema.exclude(["COMPLETED"]),
    vehicle: resourceVehicleIdentitySchema,
  })
  .strict();

// Omitted for configuration-only historical Locations; null means available.
export const parkingSpotListEntrySchema = parkingSpotConfigurationSchema.extend(
  {
    occupancy: parkingSpotOccupancySchema.nullable().optional(),
  },
);

function listResponse<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      items: z.array(item).max(100),
      nextCursor: cursorSchema.nullable(),
    })
    .strict();
}

export const keySlotConfigurationListSchema = listResponse(
  keySlotConfigurationSchema,
);
export const parkingSpotConfigurationListSchema = listResponse(
  parkingSpotConfigurationSchema,
);
export const parkingSpotListResponseSchema = listResponse(
  parkingSpotListEntrySchema,
);
export const parkingZoneSelectorListSchema = listResponse(
  parkingZoneSelectorSchema,
);

export const createKeySlotRequestSchema = z
  .object({
    operationId: uuidSchema,
    code: physicalResourceCodeSchema,
  })
  .strict();

export const createParkingSpotRequestSchema = z
  .object({
    operationId: uuidSchema,
    code: physicalResourceCodeSchema,
    label: parkingSpotLabelSchema,
    parkingZoneId: uuidSchema,
  })
  .strict();

export const createParkingZoneRequestSchema = z
  .object({
    operationId: uuidSchema,
    code: physicalResourceCodeSchema,
    label: parkingSpotLabelSchema,
  })
  .strict();

export const physicalResourceLabelSchema = z
  .object({
    resourceType: z.enum(["KEY_SLOT", "PARKING_SPOT"]),
    resourceId: uuidSchema,
    code: physicalResourceCodeSchema,
    version: z.literal("V2"),
    qrPayload: z.string().min(1).max(160),
    location: z
      .object({
        locationId: uuidSchema,
        name: z.string().min(1).max(200),
        code: z.string().min(1).max(100),
      })
      .strict(),
  })
  .strict();

export type PhysicalResourceListQuery = z.infer<
  typeof physicalResourceListQuerySchema
>;
export type KeySlotConfiguration = z.infer<typeof keySlotConfigurationSchema>;
export type ParkingSpotConfiguration = z.infer<
  typeof parkingSpotConfigurationSchema
>;
export type ParkingSpotListEntry = z.infer<typeof parkingSpotListEntrySchema>;
export type ParkingZoneSelector = z.infer<typeof parkingZoneSelectorSchema>;
export type CreateKeySlotRequest = z.infer<typeof createKeySlotRequestSchema>;
export type CreateParkingSpotRequest = z.infer<
  typeof createParkingSpotRequestSchema
>;
export type CreateParkingZoneRequest = z.infer<
  typeof createParkingZoneRequestSchema
>;
export type PhysicalResourceLabel = z.infer<typeof physicalResourceLabelSchema>;
