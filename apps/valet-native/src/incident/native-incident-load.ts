import {
  staffValetSessionDetailResponseSchema,
  observeIncidentPreflight,
  observeIncidentPreflightAsync,
  type EmployeeClient,
} from "@valet/employee-client";
import { recordNativeIncidentPreflight } from "./native-incident-preflight";

export async function loadNativeIncidentDetail(
  client: EmployeeClient,
  sessionId: string,
) {
  const raw = await observeIncidentPreflightAsync(
    recordNativeIncidentPreflight,
    "session-detail-transport",
    () => client.request<unknown>({
      method: "GET",
      path: `/v1/staff/valet-sessions/${sessionId}`,
    }),
  );
  return observeIncidentPreflight(
    recordNativeIncidentPreflight,
    "session-detail-response",
    () => staffValetSessionDetailResponseSchema.parse(raw),
  );
}
