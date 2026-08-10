import { z } from "zod";

export const apiErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;
