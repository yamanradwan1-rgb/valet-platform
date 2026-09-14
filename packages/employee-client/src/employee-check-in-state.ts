import type {
  EmployeeCheckInContinuation,
  EmployeeCheckInSnapshot,
} from "./employee-check-in-types";
export { normalizeJordanCheckInPhone } from "@valet/contracts";

export function emptyCheckInContinuation(): EmployeeCheckInContinuation {
  return {
    conditionSelection: null,
    detailsDraft: { color: "", make: "", model: "" },
    identityDraft: {
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "",
      temporaryDescriptor: "",
    },
    lastMutationKind: null,
    mode: "view",
    pendingConditionSelection: null,
    pendingConditionStage: null,
    pendingIntent: null,
  };
}

export function emptyEmployeeCheckInSnapshot(): EmployeeCheckInSnapshot {
  return {
    active: null,
    continuation: emptyCheckInContinuation(),
    customerPhone: "",
    error: null,
    identityGeneration: null,
    locationId: null,
    phase: "inactive",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle: {
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "",
      temporaryDescriptor: "",
    },
  };
}
