import { z } from "zod";

import { staffValetSessionStateSchema } from "./staff-valet-session.js";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });

/**
 * Active-directory row lifecycle states. COMPLETED sessions are excluded from
 * the directory by definition (DEC-066 §6); excluding the value here as well
 * keeps a leaking COMPLETED row a contract failure instead of a disclosure.
 */
export const staffVehicleDirectoryRowStateSchema =
  staffValetSessionStateSchema.exclude(["COMPLETED"]);

export type StaffVehicleDirectoryRowState = z.infer<
  typeof staffVehicleDirectoryRowStateSchema
>;

/**
 * Vehicle descriptor projection for directory rows. Operational facts only;
 * never credentials, tokens, hashes, membership IDs, or versions.
 */
export const staffVehicleDirectoryVehicleSchema = z
  .object({
    color: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    plateCountry: z.string().nullable(),
    plateNumberRaw: z.string().nullable(),
    temporaryDescriptor: z.string().nullable(),
  })
  .strict();

export type StaffVehicleDirectoryVehicle = z.infer<
  typeof staffVehicleDirectoryVehicleSchema
>;

export const staffVehicleDirectoryKeySlotVisibilitySchema = z.enum([
  "VISIBLE",
  "RESTRICTED",
  "UNASSIGNED",
]);

export type StaffVehicleDirectoryKeySlotVisibility = z.infer<
  typeof staffVehicleDirectoryKeySlotVisibilitySchema
>;

export const staffVehicleDirectoryVisibilityCapability =
  "key-slot-visibility-v1" as const;
export const staffVehicleDirectoryVisibilityCapabilityHeader =
  "Valet-Vehicle-Directory-Capability" as const;

const staffVehicleDirectoryLegacyRowShape = {
  createdAt: utcTimestampSchema,
  keySlotCode: z.string().min(1).nullable(),
  parkingSpotCode: z.string().nullable(),
  parkingZoneCode: z.string().nullable(),
  sessionId: uuidSchema,
  state: staffVehicleDirectoryRowStateSchema,
  updatedAt: utcTimestampSchema,
  vehicle: staffVehicleDirectoryVehicleSchema,
};

/** Exact strict row schema consumed by clients released before visibility v1. */
export const staffVehicleDirectoryLegacyRowSchema = z
  .object(staffVehicleDirectoryLegacyRowShape)
  .strict();

export type StaffVehicleDirectoryLegacyRow = z.infer<
  typeof staffVehicleDirectoryLegacyRowSchema
>;

/**
 * One active vehicle row. `keySlotCode` is field-masked per role:
 * VALET_SUPERVISOR receives staff-only Key Slot detail inside the exact
 * authorized Location; VALET_EMPLOYEE rows always carry null (fail closed,
 * DEC-066 §8). `keySlotVisibility` distinguishes that masking from a genuine
 * lack of assignment without disclosing the protected code. Row visibility
 * never grants command authority.
 */
export const staffVehicleDirectoryRowSchema = z
  .object({
    ...staffVehicleDirectoryLegacyRowShape,
    keySlotVisibility: staffVehicleDirectoryKeySlotVisibilitySchema,
  })
  .strict()
  .superRefine((row, context) => {
    const codeMatchesVisibility =
      row.keySlotVisibility === "VISIBLE"
        ? row.keySlotCode !== null
        : row.keySlotCode === null;
    if (!codeMatchesVisibility) {
      context.addIssue({
        code: "custom",
        message: "Key Slot code does not match its visibility.",
        path: ["keySlotCode"],
      });
    }
  });

export type StaffVehicleDirectoryRow = z.infer<
  typeof staffVehicleDirectoryRowSchema
>;

/**
 * Strict query selector for the employee vehicle directory read. The
 * locationId is only a requested resource selector; all authority is
 * server-derived (DEC-066 §7).
 */
export const staffVehicleDirectoryQuerySchema = z
  .object({ locationId: uuidSchema })
  .strict();

export type StaffVehicleDirectoryQuery = z.infer<
  typeof staffVehicleDirectoryQuerySchema
>;

/**
 * Capped directory page. At most 100 rows are returned; `truncated` reports
 * that more non-COMPLETED sessions exist than the safety cap carried.
 */
export const staffVehicleDirectoryResponseSchema = z
  .object({
    locationId: uuidSchema,
    rows: z.array(staffVehicleDirectoryRowSchema),
    truncated: z.boolean(),
  })
  .strict();

export type StaffVehicleDirectoryResponse = z.infer<
  typeof staffVehicleDirectoryResponseSchema
>;

/** Exact strict response schema consumed by pre-capability clients. */
export const staffVehicleDirectoryLegacyResponseSchema = z
  .object({
    locationId: uuidSchema,
    rows: z.array(staffVehicleDirectoryLegacyRowSchema),
    truncated: z.boolean(),
  })
  .strict();

export type StaffVehicleDirectoryLegacyResponse = z.infer<
  typeof staffVehicleDirectoryLegacyResponseSchema
>;
