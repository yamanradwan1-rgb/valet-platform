import {
  shiftPresenceZoneCreateRequestSchema,
  type ShiftPresenceZone,
} from "@valet/contracts";

export interface ZoneDraft {
  label: string;
  code: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  state: string;
}
export function zoneDraft(zone?: ShiftPresenceZone): ZoneDraft {
  return zone
    ? {
        label: zone.label,
        code: zone.code,
        latitude: String(zone.latitude),
        longitude: String(zone.longitude),
        radiusMeters: String(zone.radiusMeters),
        state: zone.state,
      }
    : {
        label: "",
        code: "",
        latitude: "",
        longitude: "",
        radiusMeters: "",
        state: "",
      };
}
const schema = shiftPresenceZoneCreateRequestSchema.omit({
  mutationId: true,
  zoneId: true,
});
export function parseZoneDraft(draft: ZoneDraft) {
  const numeric = (text: string) => (text.trim() === "" ? NaN : Number(text));
  return schema.safeParse({
    label: draft.label,
    code: draft.code,
    latitude: numeric(draft.latitude),
    longitude: numeric(draft.longitude),
    radiusMeters: numeric(draft.radiusMeters),
    state: draft.state,
  });
}
export function draftCenter(draft: ZoneDraft) {
  if (!draft.latitude.trim() || !draft.longitude.trim()) return null;
  const lat = Number(draft.latitude);
  const lng = Number(draft.longitude);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}
