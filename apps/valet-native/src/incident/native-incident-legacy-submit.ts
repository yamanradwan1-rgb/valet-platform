import {
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
  type EmployeeClient,
  type ReportIncidentResponse,
} from "@valet/employee-client";
import type { NativeIncidentSubmitInput } from "./native-incident-types";
import { nativeSecureRandomUUID } from "../crypto/native-secure-crypto";

export function createNativeLegacyIncidentId(): string {
  return nativeSecureRandomUUID();
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
