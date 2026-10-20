import type { InspectorFilter, InspectorResource } from "./resource-inspector-contract";
import type { inspectorCopy } from "./resource-inspector-copy";

type Copy = ReturnType<typeof inspectorCopy>;

export function resourceIsBusy(item: InspectorResource) {
  return item.usage === "IN_USE" || item.usage === "OCCUPIED";
}

export function resourceState(item: InspectorResource) {
  if (item.status !== "ACTIVE") return "inactive";
  if (item.usage === "UNKNOWN") return "unknown";
  return resourceIsBusy(item) ? "busy" : "available";
}

export function resourceUsage(item: InspectorResource, t: Copy) {
  if (item.status !== "ACTIVE" || item.usage === "UNKNOWN") return t.unknown;
  if (item.usage === "IN_USE") return t.inUse;
  if (item.usage === "OCCUPIED") return t.occupied;
  return t.available;
}

export function resourceVehicle(item: InspectorResource, t: Copy) {
  if (item.status !== "ACTIVE" || item.usage === "UNKNOWN")
    return { label: t.vehicleAssociationUnknown, dir: "auto" as const };
  if (item.usage === "AVAILABLE")
    return { label: t.noVehicle, dir: "auto" as const };
  const plate = item.vehicle?.plateNumberNormalized?.trim();
  if (plate) return { label: plate, dir: "ltr" as const };
  return {
    label: item.vehicle?.temporaryDescriptor?.trim() || t.vehicleUnknown,
    dir: "auto" as const,
  };
}

export function resourceMatches(item: InspectorResource, filter: InspectorFilter) {
  if (filter === "all") return true;
  if (filter === "inactive") return item.status === "INACTIVE";
  if (item.status !== "ACTIVE") return false;
  if (filter === "busy") return resourceIsBusy(item);
  return item.usage === "AVAILABLE";
}
