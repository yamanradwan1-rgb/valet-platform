import {
  incidentRecoveryProtocol,
  incidentRecoveryProtocolHeader,
  incidentRecoveryResponseSchema,
  reserveIncidentRecoveryResponseSchema,
} from "@valet/contracts";
import type { EmployeeClient } from "./employee-client";
import type {
  IncidentRecoveryMarker,
  IncidentRecoveryTransport,
} from "./incident-recovery-types";

const headers = { [incidentRecoveryProtocolHeader]: incidentRecoveryProtocol };
const path = (marker: IncidentRecoveryMarker) =>
  `/v1/staff/valet-sessions/${marker.sessionId}/incidents/${marker.incidentId}`;

export function createIncidentRecoveryTransport(
  client: () => EmployeeClient,
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
      return reserveIncidentRecoveryResponseSchema.parse(
        await client().request({
          body: {},
          headers,
          method: "POST",
          path: `${path(marker)}/recovery-intent`,
        }),
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
