import { describe, expect, it, vi } from "vitest";
import { attendanceZone, locationPolicy } from "../../../../../../e2e/support/presence-data";
import type { PresenceApi } from "../../../settings/shift-presence-api";
import type { PresenceMutation } from "../../../settings/use-shift-presence-mutation";
import {
  parseStudioPresenceZone,
  saveStudioPresenceZone,
  studioPresenceZone,
  type StudioPresenceZone,
} from "./presence-zone-adapter";

function setup() {
  const api = {
    saveZone: vi.fn().mockResolvedValue({
      zone: attendanceZone(), readiness: locationPolicy().readiness,
    }),
    policy: vi.fn(),
    zone: vi.fn(),
  };
  const mutation = {
    blocked: false,
    run: vi.fn(async (_intent: unknown, operation: () => Promise<unknown>) =>
      operation()),
  };
  return {
    api, mutation,
    deps: {
      api: api as unknown as PresenceApi,
      mutation: mutation as unknown as Pick<PresenceMutation, "run" | "blocked">,
      current: () => true,
      canEdit: true,
    },
  };
}

describe("Policies Studio attendance-zone adapter", () => {
  it("maps authoritative zone values without losing revision or scope", () => {
    const raw = attendanceZone();
    const zone = studioPresenceZone(raw);
    expect(zone).toEqual({
      id: raw.id,
      code: raw.code,
      label: raw.label,
      latitude: raw.latitude,
      longitude: raw.longitude,
      radius: raw.radiusMeters,
      status: raw.state,
      revision: raw.revision,
    });
    expect(parseStudioPresenceZone(zone).success).toBe(true);
  });

  it("saves a zone edit with the exact server revision, no local persistence", async () => {
    const zone = studioPresenceZone(attendanceZone());
    const { api, mutation, deps } = setup();
    expect(await saveStudioPresenceZone({ ...zone, radius: 125 }, deps))
      .toBe("SAVED");
    expect(mutation.run).toHaveBeenCalledTimes(1);
    expect(mutation.run.mock.calls[0]?.[0]).toMatchObject({
      create: false, query: { kind: "ZONE", entityId: zone.id },
    });
    const intent = mutation.run.mock.calls[0]?.[0] as { mutationId: string };
    expect(api.saveZone).toHaveBeenCalledWith(
      zone.id,
      expect.objectContaining({
        expectedRevision: zone.revision,
        radiusMeters: 125,
        mutationId: intent.mutationId,
      }),
      false,
    );
  });

  it("creates through the explicit zoneId and one mutation without fake optimistic rows", async () => {
    const zone: StudioPresenceZone = {
      ...studioPresenceZone(attendanceZone()),
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      revision: null,
    };
    const { api, mutation, deps } = setup();
    expect(await saveStudioPresenceZone(zone, deps)).toBe("SAVED");
    expect(mutation.run).toHaveBeenCalledTimes(1);
    expect(api.saveZone).toHaveBeenCalledWith(
      zone.id, expect.objectContaining({ zoneId: zone.id }), true,
    );
  });

  it("rejects invalid coordinates, radius, UUID and stale authorization before mutation", async () => {
    const zone = studioPresenceZone(attendanceZone());
    const { api, mutation, deps } = setup();
    for (const candidate of [
      { ...zone, latitude: 91 },
      { ...zone, longitude: Number.NaN },
      { ...zone, radius: 1001 },
      { ...zone, id: "foreign-id", revision: null },
    ]) {
      expect(await saveStudioPresenceZone(candidate, deps)).toBe("INVALID");
    }
    expect(await saveStudioPresenceZone(zone, {
      ...deps, current: () => false,
    })).toBe("BLOCKED");
    expect(await saveStudioPresenceZone(zone, {
      ...deps, canEdit: false,
    })).toBe("BLOCKED");
    expect(mutation.run).not.toHaveBeenCalled();
    expect(api.saveZone).not.toHaveBeenCalled();
  });
});
