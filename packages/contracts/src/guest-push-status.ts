import { z } from "zod";
import { utf16StringMax } from "./utf16-string-max.js";

export const guestPushStatusRequestSchema = z.strictObject({
  endpoint: z.string().min(1).max(4096).superRefine(utf16StringMax(4096)),
});

export const guestPushStatusResponseSchema = z.strictObject({
  active: z.boolean(),
});
