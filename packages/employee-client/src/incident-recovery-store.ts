import { incidentRecoveryMarkerSchema } from "@valet/contracts";

import {
  INCIDENT_RECOVERY_LOCAL_DEADLINE_MS,
  type IncidentRecoveryMarker,
  type IncidentRecoveryStore,
} from "./incident-recovery-types";

export { incidentRecoveryMarkerSchema } from "@valet/contracts";

export function parseIncidentRecoveryMarker(
  value: unknown,
): IncidentRecoveryMarker | undefined {
  const parsed = incidentRecoveryMarkerSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export async function writeAndConfirmIncidentRecoveryMarker(
  store: IncidentRecoveryStore,
  marker: IncidentRecoveryMarker,
): Promise<void> {
  await store.write(marker);
  const confirmed = parseIncidentRecoveryMarker(await store.read());
  if (
    confirmed === undefined ||
    Object.keys(confirmed).length !== Object.keys(marker).length ||
    !Object.entries(marker).every(
      ([key, value]) =>
        confirmed[key as keyof IncidentRecoveryMarker] === value,
    )
  ) {
    throw new Error("Incident recovery marker durability was not confirmed.");
  }
}

export async function deleteAndConfirmIncidentRecoveryMarker(
  store: IncidentRecoveryStore,
): Promise<void> {
  await store.delete();
  if ((await store.read()) !== null) {
    throw new Error("Incident recovery marker deletion was not confirmed.");
  }
}

export function incidentRecoveryLocalDeadlineReached(
  marker: IncidentRecoveryMarker,
  now = Date.now(),
): boolean {
  return (
    now >= Date.parse(marker.createdAt) + INCIDENT_RECOVERY_LOCAL_DEADLINE_MS
  );
}
