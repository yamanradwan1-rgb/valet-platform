import { z } from "zod";

import {
  managementAuditKnownEventTypeSchema,
  type ManagementAuditKnownEventType,
} from "./management-audit-events.js";
import { managementAuditKnownDetailSchema } from "./management-audit-details.js";
export { managementAuditKnownDetailSchema } from "./management-audit-details.js";

const uuidSchema = z.string().uuid();
const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{8,4096}$/);
const queryBase = {
  cursor: cursorSchema.optional(),
  eventType: managementAuditKnownEventTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
} as const;

export const managementAuditOrganizationQuerySchema = z
  .object({ ...queryBase, locationId: uuidSchema.optional() })
  .strict();

export const managementAuditLocationQuerySchema = z.object(queryBase).strict();

export const managementAuditQuerySchema =
  managementAuditOrganizationQuerySchema;

export const managementAuditScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ORGANIZATION") }).strict(),
  z.object({ kind: z.literal("LOCATION"), locationId: uuidSchema }).strict(),
]);

export const managementAuditActorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("MEMBERSHIP"),
      membershipId: uuidSchema,
      // Current membership directory identity; never a historical audit snapshot.
      currentDisplayName: z.string().min(3).max(401)
        .refine((value) =>
          Array.from(value).length <= 201 && value.trim() === value,
        ).optional(),
    })
    .strict(),
  z.object({ type: z.literal("GUEST") }).strict(),
  z.object({ type: z.literal("SYSTEM") }).strict(),
  z.object({ type: z.literal("EXTERNAL_PROVIDER") }).strict(),
  z.object({ type: z.literal("CONTROLLED_OPERATOR") }).strict(),
  z.object({ type: z.literal("UNKNOWN") }).strict(),
]);

export const managementAuditEntityTypeSchema = z.enum([
  "VALET_SESSION",
  "VEHICLE",
  "CUSTOMER",
  "TASK",
  "SHIFT",
  "INCIDENT",
  "PAYMENT",
  "VALIDATION",
  "CASH_ENTRY",
  "PAYMENT_COLLECTION_OPERATION",
  "REFUND",
  "LOCATION",
  "ORGANIZATION",
  "ORGANIZATION_MEMBERSHIP",
  "MAP_POINT",
  "MAP_AREA",
  "KEY_SLOT",
  "PARKING_SPOT",
  "SHIFT_PRESENCE_ZONE",
  "SHIFT_PRESENCE_EXCEPTION",
]);

export const managementAuditEntitySchema = z
  .object({ id: uuidSchema, type: managementAuditEntityTypeSchema })
  .strict();

const managementAuditUnknownDetailSchema = z
  .object({ kind: z.literal("UNKNOWN") })
  .strict();

export const managementAuditDetailSchema = z.union([
  managementAuditKnownDetailSchema,
  managementAuditUnknownDetailSchema,
]);

const envelope = {
  eventId: uuidSchema,
  occurredAt: z.string().datetime({ offset: true }),
  scope: managementAuditScopeSchema,
} as const;

const managementAuditVehicleSchema = z.object({
  confirmedPlate: z.string().min(1).max(64).nullable(),
  make: z.string().min(1).max(100).nullable(),
  model: z.string().min(1).max(100).nullable(),
}).strict();

const knownEventSchema = z
  .object({
    ...envelope,
    actor: managementAuditActorSchema,
    details: managementAuditKnownDetailSchema,
    entity: managementAuditEntitySchema.nullable(),
    eventType: managementAuditKnownEventTypeSchema,
    vehicle: managementAuditVehicleSchema.optional(),
  })
  .strict();

const unknownEventSchema = z
  .object({
    ...envelope,
    details: managementAuditUnknownDetailSchema,
    entity: z.null(),
    eventType: z.literal("UNKNOWN"),
  })
  .strict();

export const managementAuditEventSchema = z.union([
  knownEventSchema,
  unknownEventSchema,
]);

export const managementAuditResponseSchema = z
  .object({
    items: z.array(managementAuditEventSchema).max(100),
    nextCursor: cursorSchema.nullable(),
  })
  .strict();

export type ManagementAuditKnownEvent = ManagementAuditKnownEventType;
export type ManagementAuditOrganizationQuery = z.infer<
  typeof managementAuditOrganizationQuerySchema
>;
export type ManagementAuditLocationQuery = z.infer<
  typeof managementAuditLocationQuerySchema
>;
export type ManagementAuditQuery = ManagementAuditOrganizationQuery;
export type ManagementAuditEvent = z.infer<typeof managementAuditEventSchema>;
export type ManagementAuditResponse = z.infer<
  typeof managementAuditResponseSchema
>;
