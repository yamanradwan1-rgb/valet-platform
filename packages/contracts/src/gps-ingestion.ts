import { z } from "zod";

const gpsSampleSchema = z
  .object({
    accuracyMeters: z.number().finite().gt(0).max(100),
    capturedAt: z.string().datetime({ offset: true }),
    clientSampleId: z.string().uuid(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

export const gpsIngestionRequestSchema = z
  .object({
    samples: z.array(gpsSampleSchema).min(1).max(50),
  })
  .strict();

const gpsSampleResultSchema = z
  .object({
    clientSampleId: z.string().uuid(),
    status: z.enum(["ACCEPTED", "DUPLICATE"]),
  })
  .strict();

export const gpsIngestionResponseSchema = z
  .object({
    samples: z.array(gpsSampleResultSchema).min(1).max(50),
  })
  .strict();

export type GpsIngestionRequest = z.infer<typeof gpsIngestionRequestSchema>;
export type GpsIngestionResponse = z.infer<typeof gpsIngestionResponseSchema>;
