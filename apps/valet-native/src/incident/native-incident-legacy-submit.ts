import {
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
  type EmployeeClient,
  type ReportIncidentResponse,
} from "@valet/employee-client";
import type { NativeIncidentSubmitInput } from "./native-incident-types";

export function createNativeLegacyIncidentId(): string {
  const value = globalThis.crypto?.randomUUID?.();
  if (value === undefined) {
    throw new Error("Secure UUID generation is unavailable.");
  }
  return value;
}

export async function submitLegacyIncident(input: {
  readonly client: EmployeeClient;
  readonly incidentId: string;
  readonly sessionId: string;
  readonly values: NativeIncidentSubmitInput;
}): Promise<ReportIncidentResponse> {
  const body = reportIncidentRequestSchema.parse({
    ...input.values,
    incidentId: input.incidentId,
  });
  return reportIncidentResponseSchema.parse(
    await input.client.request<unknown>({
      body,
      method: "POST",
      path: `/v1/staff/valet-sessions/${input.sessionId}/incidents`,
    }),
  );
}
