import { z } from "zod";

export const routeHistoryQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

const routeHistorySampleSchema = z
  .object({
    capturedAt: z.string().datetime({ offset: true }),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

export const routeHistoryResponseSchema = z
  .object({
    nextCursor: z.string().min(1).max(512).nullable(),
    samples: z.array(routeHistorySampleSchema).max(500),
  })
  .strict();

export type RouteHistoryQuery = z.infer<typeof routeHistoryQuerySchema>;
export type RouteHistoryResponse = z.infer<typeof routeHistoryResponseSchema>;
