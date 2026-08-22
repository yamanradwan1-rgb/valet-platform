import {
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
  type ReportIncidentRequest,
  type ReportIncidentResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type ReportIncidentApiInput = ReportIncidentRequest;

/**
 * Exact canonical endpoint. The client-generated incidentId inside the body
 * is the stable retry boundary; this layer adds no local inference.
 */
export async function reportIncident(
  client: EmployeeApiClient,
  sessionId: string,
  input: ReportIncidentApiInput,
): Promise<ReportIncidentResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}/incidents`,
    {
      body: reportIncidentRequestSchema.parse(input),
      method: "POST",
    },
  );
  return reportIncidentResponseSchema.parse(raw);
}
