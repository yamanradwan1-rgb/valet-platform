export interface CheckInVehicleIdentityRow {
  plate_country: string | null;
  plate_number_normalized: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
}

const plateCountryPattern = /^[A-Z]{2}$/;

export function hasAcceptedPersistedVehicleIdentity(
  identity: CheckInVehicleIdentityRow,
): boolean {
  const plateFields = [
    identity.plate_country,
    identity.plate_number_raw,
    identity.plate_number_normalized,
  ];
  const allPlateFieldsPresent = plateFields.every((value) => value !== null);
  const allPlateFieldsAbsent = plateFields.every((value) => value === null);

  if (allPlateFieldsPresent) {
    return (
      plateCountryPattern.test(identity.plate_country ?? "") &&
      (identity.plate_number_raw?.trim() ?? "") !== "" &&
      (identity.plate_number_normalized?.trim() ?? "") !== ""
    );
  }

  return allPlateFieldsAbsent &&
    (identity.temporary_descriptor?.trim() ?? "") !== "";
}
