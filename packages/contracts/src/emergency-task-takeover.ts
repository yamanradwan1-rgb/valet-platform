import { z } from "zod";
import { staffManagementIdentitySchema } from "./staff-management.js";
import { staffValetSessionStateSchema } from "./staff-valet-session.js";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const isoDate = z.string().datetime({ offset: true });
const custodyEventType = z.enum([
  "SLOT_ASSIGNED",
  "CHECKED_OUT",
  "RETURNED_TO_SLOT",
  "SLOT_CLEARED",
  "RELEASED",
]);
const resource = z
  .object({
    resourceId: uuid,
    code: z.string().min(1),
    label: z.string().nullable(),
  })
  .strict();

export const emergencyTakeoverRequestSchema = z
  .object({
    operationId: uuid,
    expectedVersion: version,
    targetAssigneeMembershipId: uuid,
    reason: z
      .string()
      .refine((value) => !/\p{Cc}/u.test(value), "Control characters are not allowed.")
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(1)
          .refine((value) => [...value].length <= 500, "Reason is too long."),
      ),
  })
  .strict();

export const emergencyTakeoverContextQuerySchema = z
  .object({
    search: z
      .string()
      .refine((value) => !/\p{Cc}/u.test(value))
      .transform((value) => value.trim())
      .pipe(z.string().max(80))
      .optional(),
  })
  .strict();

export const emergencyTakeoverResponseSchema = z
  .object({
    operationId: uuid,
    replayed: z.boolean(),
    task: z
      .object({
        id: uuid,
        status: z.literal("IN_PROGRESS"),
        version,
        assigneeMembershipId: uuid,
      })
      .strict(),
    sessionVersion: version,
  })
  .strict();

export const emergencyTakeoverContextResponseSchema = z
  .object({
    canInitiate: z.boolean(),
    task: z
      .object({
        id: uuid,
        taskType: z.enum(["PARKING", "RETRIEVAL"]),
        status: z.literal("IN_PROGRESS"),
        version,
        assigneeMembershipId: uuid.nullable(),
        sessionId: uuid,
        sessionState: staffValetSessionStateSchema,
      })
      .strict(),
    vehicle: z
      .object({
        id: uuid,
        licensePlate: z.string().nullable(),
        descriptor: z.string().nullable(),
      })
      .strict(),
    currentAssignee: z
      .object({
        membershipId: uuid,
        identity: staffManagementIdentitySchema,
      })
      .strict()
      .nullable(),
    custody: z
      .object({
        source: z.enum(["RECORDED", "NONE"]),
        latestKeyEventType: custodyEventType.nullable(),
        latestKeyEventActorMembershipId: uuid.nullable(),
        occurredAt: isoDate.nullable(),
      })
      .strict(),
    resources: z
      .object({
        keySlot: resource.nullable(),
        parkingSpot: resource.nullable(),
        parkingZone: resource.nullable(),
      })
      .strict(),
    eligibleAssignees: z
      .array(
        z
          .object({
            membershipId: uuid,
            identity: staffManagementIdentitySchema,
          })
          .strict(),
      )
      .max(50),
    hasMoreEligibleAssignees: z.boolean(),
    recentCustodyEvents: z
      .array(
        z
          .object({
            eventId: uuid,
            eventType: custodyEventType,
            actorMembershipId: uuid,
            keySlotId: uuid.nullable(),
            occurredAt: isoDate,
          })
          .strict(),
      )
      .max(10),
    recentTakeovers: z
      .array(
        z
          .object({
            eventId: uuid,
            actorMembershipId: uuid.nullable(),
            fromAssigneeMembershipId: uuid.nullable(),
            toAssigneeMembershipId: uuid,
            occurredAt: isoDate,
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

export type EmergencyTakeoverRequest = z.infer<
  typeof emergencyTakeoverRequestSchema
>;
export type EmergencyTakeoverContextQuery = z.infer<
  typeof emergencyTakeoverContextQuerySchema
>;
export type EmergencyTakeoverResponse = z.infer<
  typeof emergencyTakeoverResponseSchema
>;
export type EmergencyTakeoverContextResponse = z.infer<
  typeof emergencyTakeoverContextResponseSchema
>;
