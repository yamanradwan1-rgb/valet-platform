import type {
  EmployeeCheckInSnapshot,
  EmployeeOperationalScope,
} from "@valet/employee-client";

// Sanitized display values only. No phone, credential, live ID or runtime client.
export const whatsAppPrototypeScope: EmployeeOperationalScope = {
  locationCode: "DEMO-310",
  locationId: "demo-location",
  locationName: "Demo Hotel",
  membershipId: "demo-membership",
  organizationId: "demo-organization",
  organizationName: "Demo Operator",
  role: "VALET_EMPLOYEE",
  shiftId: "demo-shift",
  shiftStartedAt: "2026-11-13T09:00:00.000Z",
};

export const whatsAppPrototypeSnapshot: EmployeeCheckInSnapshot = {
  active: {
    conditionCompletedAt: "2026-11-13T09:00:00.000Z",
    sessionId: "demo-session",
    state: "AWAITING_PARKING",
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "DEMO 310",
      temporaryDescriptor: null,
      vehicleId: "demo-vehicle",
      vehicleUpdatedAt: "2026-11-13T09:00:00.000Z",
    },
    version: 2,
  },
  continuation: {
    conditionSelection: "No visible issue",
    detailsDraft: { color: "Black", make: "Toyota", model: "Camry" },
    identityDraft: {
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "DEMO 310",
      temporaryDescriptor: "",
    },
    lastMutationKind: null,
    mode: "view",
    pendingConditionSelection: null,
    pendingConditionStage: null,
    pendingIntent: null,
  },
  customerPhone: "",
  error: null,
  identityGeneration: 1,
  locationId: "demo-location",
  phase: "continuation",
  recognizedVehicle: null,
  recoverables: [],
  recoveryChecked: true,
  vehicle: {
    mode: "CONFIRMED_PLATE",
    plateCountry: "JO",
    plateNumberRaw: "DEMO 310",
    temporaryDescriptor: "",
  },
};
