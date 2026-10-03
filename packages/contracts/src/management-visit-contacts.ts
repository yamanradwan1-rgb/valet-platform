import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{8,4096}$/);
const pageLimitSchema = z.coerce.number().int().min(1).max(50).default(25);

export const managementVisitContactSearchQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: pageLimitSchema,
    name: z.string().min(2).max(80).optional(),
    phone: z.string().min(1).max(40).optional(),
    plate: z.string().min(1).max(64).optional(),
    plateCountry: z.string().min(1).max(8).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const modes = Number(value.phone !== undefined) +
      Number(value.name !== undefined) + Number(value.plate !== undefined);
    const validPlate = value.plate === undefined
      ? value.plateCountry === undefined
      : value.plateCountry !== undefined;
    if (modes !== 1 || !validPlate) {
      context.addIssue({ code: "custom", message: "Invalid visit-contact search mode." });
    }
  });

export const managementVisitHistoryQuerySchema = z
  .object({ cursor: cursorSchema.optional(), limit: pageLimitSchema })
  .strict();

const phoneProjectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FULL"), value: z.string().regex(/^\+9627[0-9]{8}$/) }).strict(),
  z.object({ kind: z.literal("MASKED"), ending: z.string().regex(/^[0-9]{4}$/) }).strict(),
]);

const latestVisitSchema = z.object({
  createdAt: timestampSchema,
  locationId: uuidSchema,
  locationName: z.string().min(1).max(200),
  valetSessionId: uuidSchema,
}).strict();

const observedVehicleSchema = z.object({
  plateCountry: z.string().nullable(),
  plateNumberRaw: z.string().nullable(),
  vehicleId: uuidSchema,
}).strict();

export const managementVisitCustomerResultSchema = z.object({
  associatedVehicles: z.array(observedVehicleSchema).max(5),
  completedVisitCount: z.number().int().nonnegative(),
  customerId: uuidSchema,
  customerUpdatedAt: timestampSchema,
  displayName: z.string().nullable(),
  kind: z.literal("CUSTOMER"),
  latestVisit: latestVisitSchema.nullable(),
  phone: phoneProjectionSchema,
}).strict();

export const managementVisitVehicleResultSchema = z.object({
  completedVisitCount: z.number().int().nonnegative(),
  kind: z.literal("VEHICLE"),
  latestVisit: latestVisitSchema.nullable(),
  plateCountry: z.string(),
  plateNumberRaw: z.string(),
  vehicleId: uuidSchema,
  vehicleUpdatedAt: timestampSchema,
}).strict();

export const managementVisitContactSearchResponseSchema = z.object({
  items: z.array(z.union([
    managementVisitCustomerResultSchema,
    managementVisitVehicleResultSchema,
  ])).max(50),
  matchState: z.enum(["NONE", "UNIQUE", "AMBIGUOUS"]),
  mode: z.enum(["NAME", "PHONE", "PLATE"]),
  nextCursor: cursorSchema.nullable(),
}).strict();

export const managementVisitHistoryItemSchema = z.object({
  completedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  customerId: uuidSchema.nullable(),
  displayName: z.string().nullable(),
  locationId: uuidSchema,
  locationName: z.string().min(1).max(200),
  phone: phoneProjectionSchema.nullable(),
  plateCountry: z.string().nullable(),
  plateNumberRaw: z.string().nullable(),
  returningContact: z.boolean(),
  state: z.enum([
    "CHECKING_IN", "AWAITING_PARKING", "PARKING", "PARKED", "REQUESTED",
    "RETRIEVING", "READY", "HANDOFF_PENDING", "COMPLETED", "CANCELLED",
  ]),
  valetSessionId: uuidSchema,
  vehicleId: uuidSchema,
}).strict();

export const managementVisitHistoryResponseSchema = z.object({
  items: z.array(managementVisitHistoryItemSchema).max(50),
  nextCursor: cursorSchema.nullable(),
}).strict();

export const managementVisitContactNameCorrectionRequestSchema = z.object({
  displayName: z.string().nullable(),
  expectedUpdatedAt: timestampSchema,
}).strict();

export const managementVisitContactPhoneCorrectionRequestSchema = z.object({
  expectedUpdatedAt: timestampSchema,
  phone: z.string().min(1).max(40),
}).strict();

export const managementVisitContactCorrectionResponseSchema = z.object({
  changed: z.boolean(),
  customerId: uuidSchema,
  updatedAt: timestampSchema,
}).strict();

export type ManagementVisitContactSearchQuery = z.infer<
  typeof managementVisitContactSearchQuerySchema
>;
export type ManagementVisitHistoryQuery = z.infer<typeof managementVisitHistoryQuerySchema>;
export type ManagementVisitContactSearchResponse = z.infer<
  typeof managementVisitContactSearchResponseSchema
>;
export type ManagementVisitHistoryResponse = z.infer<typeof managementVisitHistoryResponseSchema>;
export type ManagementVisitContactNameCorrectionRequest = z.infer<
  typeof managementVisitContactNameCorrectionRequestSchema
>;
export type ManagementVisitContactPhoneCorrectionRequest = z.infer<
  typeof managementVisitContactPhoneCorrectionRequestSchema
>;
