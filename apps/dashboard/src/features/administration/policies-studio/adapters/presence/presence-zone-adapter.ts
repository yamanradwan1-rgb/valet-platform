import {
  shiftPresenceZoneCreateRequestSchema,
  shiftPresenceZoneUpdateRequestSchema,
  type ShiftPresenceZone,
} from "@valet/contracts";
import {
  parseZoneDraft,
  type ZoneDraft,
} from "../../../settings/shift-presence-zone-draft";
import { presenceId } from "../../../settings/shift-presence-id";
import { saveZoneWithReadinessFeedback } from "../../../settings/shift-presence-zone-readiness";
import type { PresenceApi } from "../../../settings/shift-presence-api";
import type { PresenceMutation } from "../../../settings/use-shift-presence-mutation";
import type { PresenceWriteOutcome } from "./presence-policy-adapter";

/** Shape used by the frozen prototype; revision is retained for server CAS. */
export interface StudioPresenceZone {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radius: number;
  readonly status: "ACTIVE" | "DISABLED";
  readonly revision: number | null;
}

export function studioPresenceZone(zone: ShiftPresenceZone): StudioPresenceZone {
  return {
    id: zone.id,
    code: zone.code,
    label: zone.label,
    latitude: zone.latitude,
    longitude: zone.longitude,
    radius: zone.radiusMeters,
    status: zone.state,
    revision: zone.revision,
  };
}

/** Manual/map/geolocation coordinates remain an unsaved draft until submission. */
export function parseStudioPresenceZone(zone: StudioPresenceZone) {
  const draft: ZoneDraft = {
    code: zone.code,
    label: zone.label,
    latitude: String(zone.latitude),
    longitude: String(zone.longitude),
    radiusMeters: String(zone.radius),
    state: zone.status,
  };
  return parseZoneDraft(draft);
}

export interface PresenceZoneWriteDeps {
  readonly api: PresenceApi;
  readonly mutation: Pick<PresenceMutation, "run" | "blocked">;
  readonly current: () => boolean;
  readonly canEdit: boolean;
}

/** Server owns code uniqueness, revision CAS and strict final-zone protection. */
export async function saveStudioPresenceZone(
  zone: StudioPresenceZone,
  deps: PresenceZoneWriteDeps,
): Promise<PresenceWriteOutcome> {
  if (!deps.current() || !deps.canEdit || deps.mutation.blocked)
    return "BLOCKED";
  const parsed = parseStudioPresenceZone(zone);
  if (!parsed.success) return "INVALID";
  const create = zone.revision === null;
  const mutationId = presenceId();
  const body = {
    ...parsed.data,
    mutationId,
    ...(create
      ? { zoneId: zone.id }
      : { expectedRevision: zone.revision }),
  };
  const validated = (create
    ? shiftPresenceZoneCreateRequestSchema
    : shiftPresenceZoneUpdateRequestSchema).safeParse(body);
  if (!validated.success) return "INVALID";
  if (!deps.current() || deps.mutation.blocked) return "BLOCKED";
  const result = await deps.mutation.run(
    { mutationId, create, query: { kind: "ZONE", entityId: zone.id } },
    async () => ({
      kind: "ZONE" as const,
      value: await saveZoneWithReadinessFeedback(
        deps.api, zone.id, validated.data, create,
      ),
    }),
  );
  if (!deps.current()) return "BLOCKED";
  return result?.kind === "ZONE" ? "SAVED" : "UNRESOLVED";
}
