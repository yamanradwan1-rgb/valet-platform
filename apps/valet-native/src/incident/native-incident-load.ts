import {
  staffValetSessionDetailResponseSchema,
  observeIncidentPreflight,
  observeIncidentPreflightAsync,
  type EmployeeClient,
} from "@valet/employee-client";
import { recordNativeIncidentPreflight } from "./native-incident-preflight";
import { inactiveIncident } from "./native-incident-recovery-snapshot";
import type { NativeIncidentSnapshot } from "./native-incident-types";
import type { NativeContextualTarget } from "../shell/native-contextual-route";

export async function loadNativeIncidentSnapshot(
  client: () => EmployeeClient,
  target: NativeContextualTarget,
): Promise<NativeIncidentSnapshot> {
  try {
    const detail = await loadNativeIncidentDetail(client(), target.sessionId);
    if (["COMPLETED", "CANCELLED"].includes(detail.state))
      throw new Error("terminal");
    return { ...inactiveIncident, detail, phase: "form", target };
  } catch {
    return { ...inactiveIncident, phase: "context-error", target };
  }
}

export async function loadNativeIncidentDetail(
  client: EmployeeClient,
  sessionId: string,
) {
  const raw = await observeIncidentPreflightAsync(
    recordNativeIncidentPreflight,
    "session-detail-transport",
    () =>
      client.request<unknown>({
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
