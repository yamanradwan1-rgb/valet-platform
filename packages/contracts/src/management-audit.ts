import { z } from "zod";

import { incidentSeveritySchema, incidentTypeSchema } from "./incidents.js";
import {
  managementAuditKnownEventTypeSchema,
  type ManagementAuditKnownEventType,
} from "./management-audit-events.js";
import { staffValetSessionStateSchema } from "./staff-valet-session.js";

const uuidSchema = z.string().uuid();
const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{8,512}$/);
const positiveVersionSchema = z.number().int().positive();
const nonNegativeCountSchema = z.number().int().nonnegative();
const taskStatusSchema = z.enum([
  "QUEUED",
  "ASSIGNED",
  "ACCEPTED",
  "DECLINED",
  "REASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

const queryBase = {
  cursor: cursorSchema.optional(),
  eventType: managementAuditKnownEventTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
} as const;

export const managementAuditOrganizationQuerySchema = z
  .object({ ...queryBase, locationId: uuidSchema.optional() })
  .strict();

export const managementAuditLocationQuerySchema = z.object(queryBase).strict();

export const managementAuditQuerySchema = managementAuditOrganizationQuerySchema;

export const managementAuditScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ORGANIZATION") }).strict(),
  z.object({ kind: z.literal("LOCATION"), locationId: uuidSchema }).strict(),
]);

export const managementAuditActorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MEMBERSHIP"), membershipId: uuidSchema }).strict(),
  z.object({ type: z.literal("GUEST") }).strict(),
  z.object({ type: z.literal("SYSTEM") }).strict(),
  z.object({ type: z.literal("EXTERNAL_PROVIDER") }).strict(),
  z.object({ type: z.literal("CONTROLLED_OPERATOR") }).strict(),
  z.object({ type: z.literal("UNKNOWN") }).strict(),
]);

export const managementAuditEntityTypeSchema = z.enum([
  "VALET_SESSION",
  "VEHICLE",
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
]);

export const managementAuditEntitySchema = z
  .object({ id: uuidSchema, type: managementAuditEntityTypeSchema })
  .strict();

const lifecycleFields = {
  fromState: staffValetSessionStateSchema.optional(),
  fromVersion: positiveVersionSchema.optional(),
  toState: staffValetSessionStateSchema.optional(),
  toVersion: positiveVersionSchema.optional(),
} as const;

export const managementAuditKnownDetailSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("CHECK_IN"),
      ...lifecycleFields,
      customerPresent: z.boolean().optional(),
      effectivePhotosRequired: z.boolean().optional(),
      identityMode: z
        .enum(["CONFIRMED_PLATE", "TEMPORARY_DESCRIPTOR"])
        .optional(),
      qualifyingPhotoPresent: z.boolean().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("KEY"), fromVersion: positiveVersionSchema.optional(), toVersion: positiveVersionSchema.optional() }).strict(),
  z
    .object({
      kind: z.literal("TASK"),
      fromStatus: taskStatusSchema.optional(),
      fromVersion: positiveVersionSchema.optional(),
      toStatus: taskStatusSchema.optional(),
      toVersion: positiveVersionSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("SHIFT"),
      fromStatus: z.enum(["ACTIVE", "ENDED"]).optional(),
      status: z.enum(["ACTIVE", "ENDED"]).optional(),
      toStatus: z.enum(["ACTIVE", "ENDED"]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("SESSION"),
      ...lifecycleFields,
      attempt: nonNegativeCountSchema.optional(),
      handoffMethod: z
        .enum(["DYNAMIC_QR", "PICKUP_CODE", "SUPERVISOR_OVERRIDE"])
        .optional(),
      maxAttempts: nonNegativeCountSchema.optional(),
      terminalized: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("INCIDENT"),
      severity: incidentSeveritySchema.optional(),
      status: z.literal("OPEN").optional(),
      type: incidentTypeSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("FINANCIAL") }).strict(),
  z.object({ kind: z.literal("MAP") }).strict(),
  z
    .object({
      kind: z.literal("CONFIGURATION"),
      operation: z.enum(["SET", "CLEAR"]).optional(),
      settingKey: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("REPORT") }).strict(),
  z
    .object({
      kind: z.literal("STAFF"),
      locationCount: nonNegativeCountSchema.optional(),
      newRole: z
        .enum(["ORG_ADMIN", "LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE"])
        .optional(),
      newStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      previousRole: z
        .enum(["ORG_ADMIN", "LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE"])
        .optional(),
      previousStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      role: z
        .enum(["ORG_ADMIN", "LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE"])
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("MANAGEMENT"),
      acceptingIntake: z.boolean().optional(),
      fromAcceptingIntake: z.boolean().optional(),
      fromStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      newCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
      newTimezone: z.string().min(1).max(255).optional(),
      operation: z.enum(["SET", "CLEAR"]).optional(),
      previousCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
      previousTimezone: z.string().min(1).max(255).optional(),
      settingKey: z.string().min(1).max(100).optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      toAcceptingIntake: z.boolean().optional(),
      toStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .strict(),
]);

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

const knownEventSchema = z
  .object({
    ...envelope,
    actor: managementAuditActorSchema,
    details: managementAuditKnownDetailSchema,
    entity: managementAuditEntitySchema.nullable(),
    eventType: managementAuditKnownEventTypeSchema,
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
export type ManagementAuditResponse = z.infer<typeof managementAuditResponseSchema>;
