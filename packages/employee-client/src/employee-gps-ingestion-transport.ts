import {
  gpsIngestionRequestSchema,
  gpsIngestionResponseSchema,
  type GpsIngestionRequest,
  type GpsIngestionResponse,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeClient } from "./employee-client";

export type EmployeeGpsSample = GpsIngestionRequest["samples"][number];

export interface EmployeeGpsIngestionTransport {
  upload(
    sessionId: string,
    samples: readonly EmployeeGpsSample[],
    signal?: AbortSignal,
  ): Promise<GpsIngestionResponse>;
}

function invalidResponse(): EmployeeApiError {
  return new EmployeeApiError({
    code: "GPS_INGESTION_RESPONSE_INVALID",
    message: "The GPS ingestion response was invalid.",
    status: 502,
  });
}

export function createEmployeeGpsIngestionTransport(
  clientFactory: (signal?: AbortSignal) => EmployeeClient,
): EmployeeGpsIngestionTransport {
  return {
    async upload(sessionId, samples, signal) {
      const body = gpsIngestionRequestSchema.parse({ samples });
      const value = await clientFactory(signal).request<unknown>({
        body,
        method: "POST",
        path: `/v1/staff/valet-sessions/${sessionId}/tracking/gps-samples`,
      });
      const parsed = gpsIngestionResponseSchema.safeParse(value);
      if (!parsed.success) throw invalidResponse();
      return parsed.data;
    },
  };
}
