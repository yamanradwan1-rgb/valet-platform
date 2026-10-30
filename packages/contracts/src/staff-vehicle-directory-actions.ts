import { z } from "zod";
import {
  staffVehicleDirectoryResponseSchema,
  staffVehicleDirectoryRowSchema,
} from "./staff-vehicle-directory.js";

/** Explicit negotiation preserves both previously released strict responses. */
export const staffVehicleDirectoryActionsCapability =
  "check-in-actions-v2" as const;
export const staffVehicleDirectoryActionsRowSchema =
  staffVehicleDirectoryRowSchema
    .safeExtend({
      canContinueCheckIn: z.boolean(),
      canCancelCheckIn: z.boolean(),
    })
    .superRefine((row, context) => {
      if (
        row.state !== "CHECKING_IN" &&
        (row.canContinueCheckIn || row.canCancelCheckIn)
      ) {
        context.addIssue({
          code: "custom",
          message: "Check-In actions require an incomplete Check-In.",
          path: ["state"],
        });
      }
    });
export const staffVehicleDirectoryActionsResponseSchema =
  staffVehicleDirectoryResponseSchema.extend({
    rows: z.array(staffVehicleDirectoryActionsRowSchema).max(100),
  });
export type StaffVehicleDirectoryActionsRow = z.infer<
  typeof staffVehicleDirectoryActionsRowSchema
>;
export type StaffVehicleDirectoryActionsResponse = z.infer<
  typeof staffVehicleDirectoryActionsResponseSchema
>;
