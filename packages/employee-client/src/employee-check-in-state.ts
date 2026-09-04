import type { EmployeeCheckInSnapshot } from "./employee-check-in-types";

export function emptyEmployeeCheckInSnapshot(): EmployeeCheckInSnapshot {
  return {
    active: null,
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

export function normalizeJordanCheckInPhone(input: string): string {
  const compact = input
    .trim()
    .normalize("NFKC")
    .replace(/[\s()\p{Pd}]+/gu, "");
  if (compact === "" || /^\+9627[0-9]{8}$/.test(compact)) return compact;
  const national = compact.startsWith("0") ? compact.slice(1) : compact;
  return /^7[0-9]{8}$/.test(national) ? `+962${national}` : compact;
}
