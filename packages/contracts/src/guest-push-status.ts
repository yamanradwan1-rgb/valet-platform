import { z } from "zod";

export const guestPushStatusRequestSchema = z.strictObject({
  endpoint: z.string().min(1).max(4096),
});

export const guestPushStatusResponseSchema = z.strictObject({
  active: z.boolean(),
});
