import { z } from "zod";
import { shiftCashReconciliationSchema } from "./shifts.js";

/** Detail-only financial evidence. Never add to the history list entry. */
export const staffShiftCashReconciliationSchema = z.discriminatedUnion(
  "state",
  [
    z
      .object({
        state: z.literal("REPORTED"),
        snapshot: shiftCashReconciliationSchema
          .extend({
            reportedBy: z.string().min(1).max(401).nullable(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        state: z.enum(["NOT_REPORTED", "PENDING", "UNAVAILABLE"]),
        snapshot: z.null(),
      })
      .strict(),
  ],
);

export type StaffShiftCashReconciliation = z.infer<
  typeof staffShiftCashReconciliationSchema
>;
