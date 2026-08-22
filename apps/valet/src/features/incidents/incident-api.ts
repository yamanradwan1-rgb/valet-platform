import {
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
  type ReportIncidentRequest,
  type ReportIncidentResponse,
} from "@valet/contracts";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,} from "../../lib/auth/staff-auth-context";

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

/**
 * Production A1 client used by the live incident flow. Built with the same
 * authenticated construction pattern as every other live feature hook so the
 * router never needs to inject a client.
 */
export function createDefaultIncidentApiClient(): EmployeeApiClient {
  return new EmployeeApiClient({
    authClient: getDefaultStaffAuthClient(),
  });
}
