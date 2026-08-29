export const vehicleDetailsLimits = {
  colorCodePoints: 80,
  makeCodePoints: 80,
  modelCodePoints: 80,
} as const;

export interface NormalizedVehicleDetails {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
}

export interface VehicleDetailsInput {
  readonly color?: string | null;
  readonly make?: string | null;
  readonly model?: string | null;
}

function normalizeValue(
  value: unknown,
  maximumCodePoints: number,
  invalid: () => never,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return invalid();
  const normalized = value.trim().normalize("NFKC");
  if (normalized === "" || Array.from(normalized).length > maximumCodePoints) {
    return invalid();
  }
  return normalized;
}

export function normalizeVehicleDetails(
  value: unknown,
  invalid: () => never,
  requireAllFields = false,
): NormalizedVehicleDetails {
  if (value === undefined && !requireAllFields) {
    return { color: null, make: null, model: null };
  }
  if (value === null || typeof value !== "object") return invalid();
  const keys = Object.keys(value);
  if (keys.some((key) => !["color", "make", "model"].includes(key))) {
    return invalid();
  }
  if (
    requireAllFields &&
    !["color", "make", "model"].every((key) => keys.includes(key))
  ) {
    return invalid();
  }
  const input = value as VehicleDetailsInput;
  return {
    color: normalizeValue(
      input.color,
      vehicleDetailsLimits.colorCodePoints,
      invalid,
    ),
    make: normalizeValue(
      input.make,
      vehicleDetailsLimits.makeCodePoints,
      invalid,
    ),
    model: normalizeValue(
      input.model,
      vehicleDetailsLimits.modelCodePoints,
      invalid,
    ),
  };
}
