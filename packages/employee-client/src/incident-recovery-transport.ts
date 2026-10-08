import {
  incidentRecoveryProtocol,
  incidentRecoveryProtocolHeader,
  incidentRecoveryResponseSchema,
  reserveIncidentRecoveryResponseSchema,
} from "@valet/contracts";
import type { EmployeeClient } from "./employee-client";
import {
  observeIncidentPreflight,
  observeIncidentPreflightAsync,
  type IncidentPreflightObserver,
} from "./incident-recovery-preflight";
import type {
  IncidentRecoveryMarker,
  IncidentRecoveryTransport,
} from "./incident-recovery-types";

const headers = { [incidentRecoveryProtocolHeader]: incidentRecoveryProtocol };
const path = (marker: IncidentRecoveryMarker) =>
  `/v1/staff/valet-sessions/${marker.sessionId}/incidents/${marker.incidentId}`;

export function createIncidentRecoveryTransport(
  client: () => EmployeeClient,
  observer?: IncidentPreflightObserver,
): IncidentRecoveryTransport {
  return {
    async read(marker) {
      return incidentRecoveryResponseSchema.parse(
        await client().request({
          method: "GET",
          path: `${path(marker)}/recovery`,
        }),
      );
    },
    async reserve(marker) {
      const response = await observeIncidentPreflightAsync(
        observer, "reserve-transport",
        () => client().request({
          body: {},
          headers,
          method: "POST",
          path: `${path(marker)}/recovery-intent`,
        }),
      );
      return observeIncidentPreflight(
        observer, "reserve-response",
        () => reserveIncidentRecoveryResponseSchema.parse(response),
      );
    },
    async retire(marker) {
      return incidentRecoveryResponseSchema.parse(
        await client().request({
          body: {},
          headers,
          method: "POST",
          path: `${path(marker)}/recovery-intent/retire`,
        }),
      );
    },
  };
}
