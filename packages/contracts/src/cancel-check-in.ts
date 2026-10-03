import { z } from "zod";
import { staffValetSessionStateSchema } from "./staff-valet-session.js";

export const cancelCheckInRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedShiftId: z.string().uuid(),
  })
  .strict();
export const cancelCheckInStatusQuerySchema = z
  .object({
    expectedShiftId: z.string().uuid(),
  })
  .strict();
const outcome = {
  sessionId: z.string().uuid(),
  locationId: z.string().uuid(),
  version: z.number().int().positive(),
};
export const cancelCheckInResponseSchema = z
  .object({
    ...outcome,
    state: z.literal("CANCELLED"),
  })
  .strict();
export const cancelCheckInStatusResponseSchema = z
  .object({
    ...outcome,
    state: staffValetSessionStateSchema,
  })
  .strict();
export type CancelCheckInRequest = z.infer<typeof cancelCheckInRequestSchema>;
export type CancelCheckInResponse = z.infer<typeof cancelCheckInResponseSchema>;
export type CancelCheckInStatusResponse = z.infer<
  typeof cancelCheckInStatusResponseSchema
>;
