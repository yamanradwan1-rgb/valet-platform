import {
  createIncidentRecoveryTransport,
  IncidentRecoveryState,
  type EmployeeClient,
  type IncidentRecoveryStore,
} from "@valet/employee-client";
import { recordNativeIncidentPreflight } from "./native-incident-preflight";

export function createNativeIncidentRecoveryState(
  store: IncidentRecoveryStore,
  client: () => EmployeeClient,
): IncidentRecoveryState {
  return new IncidentRecoveryState(
    store,
    createIncidentRecoveryTransport(client, recordNativeIncidentPreflight),
    undefined,
    undefined,
    recordNativeIncidentPreflight,
  );
}
