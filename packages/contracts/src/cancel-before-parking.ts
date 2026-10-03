import { z } from "zod";
import { checkInUuidSchema as uuid } from "./check-in-common.js";

const version = z.number().int().positive();
export const parkingCancellationSessionIdSchema = uuid;
export const cancelBeforeParkingRequestSchema = z
  .object({
    taskId: uuid,
    expectedSessionVersion: version,
    expectedTaskVersion: version,
    expectedShiftId: uuid,
  })
  .strict();
export const parkingCancellationStatusQuerySchema = z
  .object({
    taskId: uuid,
    expectedShiftId: uuid,
  })
  .strict();
const projection = {
  sessionId: uuid,
  sessionVersion: version,
  taskId: uuid,
  taskVersion: version,
};
const terminal = {
  ...projection,
  state: z.literal("CANCELLED"),
  taskStatus: z.literal("CANCELLED"),
  cancelledAt: z.string().datetime({ offset: false }),
};
export const cancelBeforeParkingResponseSchema = z.object(terminal).strict();
export const parkingCancellationStatusResponseSchema = z.discriminatedUnion(
  "outcome",
  [
    z.object({ outcome: z.literal("CANCELLED"), ...terminal }).strict(),
    z
      .object({
        outcome: z.literal("NOT_CANCELLED"),
        ...projection,
        classification: z.enum(["PRE_CUSTODY", "ADVANCED"]),
      })
      .strict(),
  ],
);
export type CancelBeforeParkingRequest = z.infer<
  typeof cancelBeforeParkingRequestSchema
>;
export type CancelBeforeParkingResponse = z.infer<
  typeof cancelBeforeParkingResponseSchema
>;
export type ParkingCancellationStatusQuery = z.infer<
  typeof parkingCancellationStatusQuerySchema
>;
export type ParkingCancellationStatusResponse = z.infer<
  typeof parkingCancellationStatusResponseSchema
>;
