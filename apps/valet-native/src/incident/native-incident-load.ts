import {
  staffValetSessionDetailResponseSchema,
  type EmployeeClient,
} from "@valet/employee-client";

export async function loadNativeIncidentDetail(
  client: EmployeeClient,
  sessionId: string,
) {
  const raw = await client.request<unknown>({
    method: "GET",
    path: `/v1/staff/valet-sessions/${sessionId}`,
  });
  return staffValetSessionDetailResponseSchema.parse(raw);
}
