import { z } from "zod";
import {
  staffDirectoryQuerySchema,
  staffManagementIdentitySchema,
  staffManagementRoleSchema,
} from "./staff-management.js";

export const staffShiftHistoryCursorPayloadSchema = z
  .object({
    v: z.literal(1),
    domain: z.enum(["shift-history", "shift-employees"]),
    organizationId: z.string().uuid(),
    scopeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    id: z.string().uuid(),
    startedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const instant = z.string().datetime({ offset: true });
const cursor = z.string().regex(/^[A-Za-z0-9_-]{8,512}$/);
const limit = z.coerce.number().int().min(1).max(100).default(50);

/** Started-in interval: inclusive from, exclusive to; no overlap semantics. */
export const staffShiftHistoryQuerySchema = z
  .object({
    membershipId: uuid.optional(),
    locationId: uuid.optional(),
    status: z.enum(["ACTIVE", "ENDED"]).optional(),
    from: instant.optional(),
    to: instant.optional(),
    cursor: cursor.optional(),
    limit,
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      Date.parse(value.from) < Date.parse(value.to),
    { message: "From must be strictly earlier than To.", path: ["to"] },
  );

/** Names and role are CURRENT membership projections, not shift-time snapshots. */
export const staffShiftHistoryEntrySchema = z
  .object({
    shiftId: uuid,
    membershipId: uuid,
    identity: staffManagementIdentitySchema,
    currentRole: staffManagementRoleSchema,
    location: z
      .object({
        locationId: uuid,
        name: z.string().min(1).max(200),
        code: z.string().min(1).max(100),
        timezone: z.string().min(1).max(100),
      })
      .strict(),
    status: z.enum(["ACTIVE", "ENDED"]),
    startedAt: instant,
    endedAt: instant.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.status === "ACTIVE"
        ? value.endedAt === null
        : value.endedAt !== null &&
          Date.parse(value.endedAt) >= Date.parse(value.startedAt),
    {
      message: "Shift status and end time are inconsistent.",
      path: ["endedAt"],
    },
  );

export const staffShiftHistoryResponseSchema = z
  .object({
    items: z.array(staffShiftHistoryEntrySchema).max(100),
    nextCursor: cursor.nullable(),
  })
  .strict();
export const staffShiftHistoryDetailSchema = staffShiftHistoryEntrySchema;

/** Candidates must have persisted history inside the actor's current Location authority. */
export const staffShiftEmployeeQuerySchema = z
  .object({
    search: staffDirectoryQuerySchema.shape.search,
    locationId: uuid.optional(),
    cursor: cursor.optional(),
    limit,
  })
  .strict();
export const staffShiftEmployeeSchema = z
  .object({
    membershipId: uuid,
    identity: staffManagementIdentitySchema,
  })
  .strict();
export const staffShiftEmployeePageSchema = z
  .object({
    items: z.array(staffShiftEmployeeSchema).max(100),
    nextCursor: cursor.nullable(),
  })
  .strict();

export type StaffShiftHistoryQuery = z.infer<
  typeof staffShiftHistoryQuerySchema
>;
export type StaffShiftHistoryEntry = z.infer<
  typeof staffShiftHistoryEntrySchema
>;
export type StaffShiftHistoryResponse = z.infer<
  typeof staffShiftHistoryResponseSchema
>;
export type StaffShiftEmployeeQuery = z.infer<
  typeof staffShiftEmployeeQuerySchema
>;
export type StaffShiftEmployee = z.infer<typeof staffShiftEmployeeSchema>;
export type StaffShiftEmployeePage = z.infer<
  typeof staffShiftEmployeePageSchema
>;
