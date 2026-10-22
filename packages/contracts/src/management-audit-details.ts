import { z } from "zod";
import { incidentSeveritySchema, incidentTypeSchema } from "./incidents.js";
import { staffValetSessionStateSchema } from "./staff-valet-session.js";
import { staffShiftForceEndReasonSchema } from "./staff-shift-force-end.js";
import { managementPresenceAuditDetailSchema } from "./management-audit-presence.js";
const uuidSchema = z.string().uuid();
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

const lifecycleFields = {
  fromState: staffValetSessionStateSchema.optional(),
  fromVersion: positiveVersionSchema.optional(),
  toState: staffValetSessionStateSchema.optional(),
  toVersion: positiveVersionSchema.optional(),
} as const;

export const managementAuditKnownDetailSchema = z.discriminatedUnion("kind", [
  managementPresenceAuditDetailSchema,
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
  z
    .object({
      kind: z.literal("KEY"),
      fromVersion: positiveVersionSchema.optional(),
      toVersion: positiveVersionSchema.optional(),
    })
    .strict(),
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
      closureKind: z.literal("ADMIN_FORCE_END").optional(),
      cashReconciliationState: z.literal("PENDING").optional(),
      targetMembershipId: uuidSchema.optional(),
      operationId: uuidSchema.optional(),
      reason: staffShiftForceEndReasonSchema.optional(),
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
      kind: z.literal("GUEST_INFORMATION"),
      operation: z.enum([
        "PRIVACY_DRAFT_SAVED",
        "PRIVACY_PUBLISHED",
        "PRIVACY_UNPUBLISHED",
        "CONTACT_COMPANY_DEFAULTS_SAVED",
        "CONTACT_LOCATION_OVERRIDE_SAVED",
      ]),
    })
    .strict(),
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
        .enum([
          "ORG_ADMIN",
          "LOCATION_MANAGER",
          "VALET_SUPERVISOR",
          "VALET_EMPLOYEE",
        ])
        .optional(),
      newStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      previousRole: z
        .enum([
          "ORG_ADMIN",
          "LOCATION_MANAGER",
          "VALET_SUPERVISOR",
          "VALET_EMPLOYEE",
        ])
        .optional(),
      previousStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      role: z
        .enum([
          "ORG_ADMIN",
          "LOCATION_MANAGER",
          "VALET_SUPERVISOR",
          "VALET_EMPLOYEE",
        ])
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("MANAGEMENT"),
      acceptingIntake: z.boolean().optional(),
      fromAcceptingIntake: z.boolean().optional(),
      fromStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      field: z.enum(["displayName", "phoneNormalized"]).optional(),
      newCurrency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional(),
      newTimezone: z.string().min(1).max(255).optional(),
      normalizationVersion: z.literal("JORDAN_MOBILE_V1").optional(),
      operation: z.enum(["SET", "CLEAR"]).optional(),
      previousCurrency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional(),
      previousTimezone: z.string().min(1).max(255).optional(),
      resourceCode: z.string().min(1).max(100).optional(),
      resourceType: z.enum(["KEY_SLOT", "PARKING_SPOT"]).optional(),
      settingKey: z.string().min(1).max(100).optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      toAcceptingIntake: z.boolean().optional(),
      toStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .strict(),
]);
