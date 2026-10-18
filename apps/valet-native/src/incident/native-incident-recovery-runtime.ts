import {
  createIncidentRecoveryTransport,
  createIncidentRecoveryId,
  IncidentRecoveryState,
  type EmployeeClient,
  type IncidentRecoveryStore,
} from "@valet/employee-client";
import { recordNativeIncidentPreflight } from "./native-incident-preflight";
import { nativeSecureRandomValues } from "../crypto/native-secure-crypto";

export function createNativeIncidentRecoveryState(
  store: IncidentRecoveryStore,
  client: () => EmployeeClient,
): IncidentRecoveryState {
  return new IncidentRecoveryState(
    store,
    createIncidentRecoveryTransport(client, recordNativeIncidentPreflight),
    () => createIncidentRecoveryId({ getRandomValues: nativeSecureRandomValues }),
    undefined,
    recordNativeIncidentPreflight,
  );
}
