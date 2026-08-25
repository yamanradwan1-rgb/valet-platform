/**
 * Truthful display labels for the authorized-location selector.
 *
 * The authorized-locations response carries location name + organizationId
 * but NO organization display name, so identical location names cannot be
 * disambiguated by organization title without inventing data. When (and only
 * when) a name collision exists inside the authorized list, the label
 * appends a short, clearly technical organization-id fragment. Names that
 * are unique render bare.
 */
export interface LocationLabelInput {
  readonly locationId: string;
  readonly name: string;
  readonly organizationId: string;
}

export function authorizedLocationLabels(
  locations: readonly LocationLabelInput[],
): ReadonlyMap<string, string> {
  const countsByName = new Map<string, number>();
  for (const entry of locations) {
    countsByName.set(entry.name, (countsByName.get(entry.name) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const entry of locations) {
    const duplicate = (countsByName.get(entry.name) ?? 0) > 1;
    labels.set(
      entry.locationId,
      duplicate
        ? `${entry.name} · org ${entry.organizationId.slice(0, 8)}…`
        : entry.name,
    );
  }
  return labels;
}
