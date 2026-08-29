// VAYLET-authored starter reference data. This small operational list was
// curated internally and was not imported from an external/proprietary source.
// It is intentionally non-exhaustive; every field also accepts free text.
export const VEHICLE_MODELS_BY_MAKE: Readonly<
  Record<string, readonly string[]>
> = {
  Audi: ["A3", "A4", "A6", "Q5", "Q7"],
  BMW: ["3 Series", "5 Series", "X3", "X5", "X7"],
  Ford: ["Explorer", "F-150", "Mustang", "Ranger"],
  Honda: ["Accord", "Civic", "CR-V", "Pilot"],
  Hyundai: ["Accent", "Elantra", "Santa Fe", "Tucson"],
  Kia: ["Cerato", "K5", "Sportage", "Sorento"],
  Lexus: ["ES", "GX", "LX", "RX"],
  Mercedes: ["C-Class", "E-Class", "GLE", "S-Class"],
  Nissan: ["Patrol", "Sunny", "X-Trail"],
  Porsche: ["Cayenne", "Macan", "Panamera", "Taycan"],
  Tesla: ["Model 3", "Model S", "Model X", "Model Y"],
  Toyota: ["Camry", "Corolla", "Land Cruiser", "Prado", "RAV4"],
};

export const VEHICLE_MAKES = Object.keys(VEHICLE_MODELS_BY_MAKE);

export const VEHICLE_COLORS = [
  "Black",
  "White",
  "Silver",
  "Gray",
  "Blue",
  "Red",
  "Brown",
  "Green",
  "Beige",
] as const;

export function vehicleModelsForMake(make: string): readonly string[] {
  const match = VEHICLE_MAKES.find(
    (candidate) =>
      candidate.toLocaleLowerCase() === make.trim().toLocaleLowerCase(),
  );
  return match ? (VEHICLE_MODELS_BY_MAKE[match] ?? []) : [];
}
