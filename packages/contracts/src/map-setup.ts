import { z } from "zod";

const uuidSchema = z.string().uuid();
const codeSchema = z.string().trim().min(1).max(64);
const labelSchema = z.string().trim().min(1).max(160);
const levelLabelSchema = z.string().trim().min(1).max(64).nullable();
const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);

export const locationMapPointKindSchema = z.enum([
  "ENTRANCE",
  "PICKUP",
  "DROP_OFF",
]);
export const locationMapAreaPurposeSchema = z.enum([
  "PARKING",
  "OVERFLOW",
  "STAGING",
  "RESTRICTED",
]);

export const locationMapVertexInputSchema = z
  .object({ latitude: latitudeSchema, longitude: longitudeSchema })
  .strict();

const pointFields = {
  active: z.boolean(),
  code: codeSchema,
  kind: locationMapPointKindSchema,
  label: labelSchema,
  latitude: latitudeSchema,
  levelLabel: levelLabelSchema,
  longitude: longitudeSchema,
} as const;

export const createLocationMapPointRequestSchema = z
  .object({
    ...pointFields,
    active: z.boolean().optional().default(true),
    levelLabel: levelLabelSchema.optional().default(null),
  })
  .strict();
export const updateLocationMapPointRequestSchema = z
  .object(pointFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export const locationMapPointSchema = z
  .object({
    ...pointFields,
    createdAt: z.string().datetime({ offset: true }),
    id: uuidSchema,
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const locationMapPointListResponseSchema = z
  .object({ points: z.array(locationMapPointSchema) })
  .strict();

const areaFields = {
  active: z.boolean(),
  code: codeSchema,
  label: labelSchema,
  levelLabel: levelLabelSchema,
  parkingZoneId: uuidSchema.nullable(),
  purpose: locationMapAreaPurposeSchema,
} as const;

export const createLocationMapAreaRequestSchema = z
  .object({
    ...areaFields,
    active: z.boolean().optional().default(true),
    levelLabel: levelLabelSchema.optional().default(null),
    parkingZoneId: uuidSchema.nullable().optional().default(null),
    vertices: z.array(locationMapVertexInputSchema).min(3).max(500),
  })
  .strict();
export const updateLocationMapAreaRequestSchema = z
  .object(areaFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
export const replaceLocationMapAreaVerticesRequestSchema = z
  .object({ vertices: z.array(locationMapVertexInputSchema).min(3).max(500) })
  .strict();

export const locationMapVertexSchema = locationMapVertexInputSchema.extend({
  position: z.number().int().min(0),
});
export const locationMapAreaSchema = z
  .object({
    ...areaFields,
    createdAt: z.string().datetime({ offset: true }),
    id: uuidSchema,
    updatedAt: z.string().datetime({ offset: true }),
    vertices: z.array(locationMapVertexSchema).min(3),
  })
  .strict();
export const locationMapAreaListResponseSchema = z
  .object({ areas: z.array(locationMapAreaSchema) })
  .strict();

export type CreateLocationMapPointRequest = z.infer<
  typeof createLocationMapPointRequestSchema
>;
export type UpdateLocationMapPointRequest = z.infer<
  typeof updateLocationMapPointRequestSchema
>;
export type LocationMapPoint = z.infer<typeof locationMapPointSchema>;
export type CreateLocationMapAreaRequest = z.infer<
  typeof createLocationMapAreaRequestSchema
>;
export type UpdateLocationMapAreaRequest = z.infer<
  typeof updateLocationMapAreaRequestSchema
>;
export type ReplaceLocationMapAreaVerticesRequest = z.infer<
  typeof replaceLocationMapAreaVerticesRequestSchema
>;
export type LocationMapArea = z.infer<typeof locationMapAreaSchema>;
