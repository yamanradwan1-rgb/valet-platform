import {
  incidentRecoveryProtocol,
  incidentRecoveryProtocolHeader,
  reportIncidentRequestSchema,
  reportIncidentResponseSchema,
  observeIncidentPreflight,
  observeIncidentPreflightAsync,
  type EmployeeClient,
  type IncidentPreflightEvent,
} from "@valet/employee-client";

import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import type { NativeIncidentSubmitInput } from "./native-incident-types";

/** Only a fixed stage/outcome crosses the bounded support telemetry boundary. */
export function recordNativeIncidentPreflight(
  event: IncidentPreflightEvent,
): void {
  getNativeTelemetry().record({
    classification: "preflight",
    errorCode: `${event.stage}.${event.outcome}`,
    operation: "incident-recovery",
    outcome: event.outcome === "start" ? "unknown" : event.outcome,
    source: "recovery",
  });
}

export function validateNativeIncidentInput(input: NativeIncidentSubmitInput) {
  return observeIncidentPreflight(
    recordNativeIncidentPreflight,
    "input-validation",
    () => reportIncidentRequestSchema.omit({ incidentId: true }).parse(input),
  );
}

export async function submitNativeIncidentReport(
  client: EmployeeClient,
  sessionId: string,
  incidentId: string,
  values: ReturnType<typeof validateNativeIncidentInput>,
) {
  const raw = await observeIncidentPreflightAsync(
    recordNativeIncidentPreflight,
    "report-transport",
    () => client.request<unknown>({
      body: { ...values, incidentId },
      headers: { [incidentRecoveryProtocolHeader]: incidentRecoveryProtocol },
      method: "POST",
      path: `/v1/staff/valet-sessions/${sessionId}/incidents`,
    }),
  );
  return observeIncidentPreflight(
    recordNativeIncidentPreflight, "report-response",
    () => reportIncidentResponseSchema.parse(raw),
  );
}
