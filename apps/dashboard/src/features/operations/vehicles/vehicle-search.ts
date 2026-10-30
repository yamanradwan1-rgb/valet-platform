import type { SessionOverviewEntry } from "@valet/contracts";

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
  return [
    makeModel,
    item.vehicle.plateNumberNormalized,
    item.vehicle.temporaryDescriptor,
  ].some((value) =>
    (value?.trim().toLocaleLowerCase() ?? "").includes(normalizedQuery),
  );
}
