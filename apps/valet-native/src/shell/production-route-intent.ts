export type ProductionDestination =
  | "check-in"
  | "parking"
  | "retrieval"
  | "scan"
  | "shift"
  | "tasks"
  | "vehicles";

export type ProductionIntentSource =
  "cold" | "navigation" | "notification" | "scan";

export interface ProductionRouteIntent {
  readonly destination: ProductionDestination;
  readonly source: ProductionIntentSource;
}

const destinations = new Set<ProductionDestination>([
  "check-in",
  "parking",
  "retrieval",
  "scan",
  "shift",
  "tasks",
  "vehicles",
]);
const sources = new Set<ProductionIntentSource>([
  "cold",
  "navigation",
  "notification",
  "scan",
]);

export function parseProductionRouteIntent(
  value: unknown,
): ProductionRouteIntent | null {
  if (value === null || typeof value !== "object") return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "destination" || keys[1] !== "source") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.destination !== "string" ||
    !destinations.has(candidate.destination as ProductionDestination) ||
    typeof candidate.source !== "string" ||
    !sources.has(candidate.source as ProductionIntentSource)
  ) {
    return null;
  }
  return {
    destination: candidate.destination as ProductionDestination,
    source: candidate.source as ProductionIntentSource,
  };
}

export function productionRouteIntentFromParam(
  value: string | readonly string[] | undefined,
): ProductionRouteIntent | null {
  if (
    typeof value !== "string" ||
    !destinations.has(value as ProductionDestination)
  ) {
    return null;
  }
  return { destination: value as ProductionDestination, source: "cold" };
}

export function productionRouteIsAllowed(
  intent: ProductionRouteIntent,
): boolean {
  if (intent.source === "notification") return intent.destination === "tasks";
  return (
    intent.destination === "tasks" ||
    intent.destination === "check-in" ||
    (intent.destination === "vehicles" && intent.source === "navigation") ||
    (intent.destination === "scan" && intent.source === "navigation") ||
    (intent.destination === "parking" && intent.source === "navigation") ||
    (intent.destination === "retrieval" && intent.source === "navigation") ||
    intent.destination === "shift"
  );
}
