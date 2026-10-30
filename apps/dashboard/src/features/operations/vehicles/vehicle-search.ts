import type { SessionOverviewEntry } from "@valet/contracts";

// Match the plate separators removed by the vehicle identity write path.
const plateSeparators = /[\s\p{Pd}._/\\]+/gu;

// This is a search projection, independent of the visible vehicle label.
export function matchesLoadedVehicleQuery(
  item: SessionOverviewEntry,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery === "") return true;

  const makeModel = [item.vehicle.make, item.vehicle.model]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
  const plateQuery = query
    .normalize("NFKC")
    .toUpperCase()
    .replace(plateSeparators, "");
  const matchesPlate =
    plateQuery !== "" &&
    (item.vehicle.plateNumberNormalized?.includes(plateQuery) ?? false);
  return (
    matchesPlate ||
    [makeModel, item.vehicle.temporaryDescriptor].some((value) =>
      (value?.trim().toLocaleLowerCase() ?? "").includes(normalizedQuery),
    )
  );
}
