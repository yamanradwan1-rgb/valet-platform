import { z } from "zod";

export const overviewListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,512}$/)
      .optional(),
  })
  .strict();
export type OverviewListQuery = z.infer<typeof overviewListQuerySchema>;

export function overviewListResponse<T extends z.ZodType>(item: T) {
  return z
    .object({ items: z.array(item), nextCursor: z.string().nullable() })
    .strict();
}
