import { describe, expect, it } from "vitest";
import { evaluateAdvancingGpsSamples } from "../src/modules/tracking/geofence-evaluation";
import { projectGeofenceViolationRow } from "../src/modules/dashboard/management-alert-sources/geofence-violation-alert-reader";

const uuid = (last: string) => `00000000-0000-4000-8000-${last}`;
const scope = {
  organizationId: uuid("000000000001"),
  locationId: uuid("000000000002"),
};
const recordedAt = new Date("2026-11-04T10:05:00.000Z");
const capturedAt = new Date("2026-11-04T10:00:00.000Z");

function row(
  options: {
    eventId?: string;
    trackingSessionId?: string;
    enteredCount?: number;
    exitedCount?: number;
    capturedAt?: Date;
    recordedAt?: Date;
  } = {},
) {
  return {
    eventId: options.eventId ?? uuid("000000000003"),
    taskId: uuid("000000000004"),
    valetSessionId: uuid("000000000005"),
    trackingSessionId: options.trackingSessionId ?? uuid("000000000006"),
    mapAreaId: uuid("000000000007"),
    enteredCount: options.enteredCount ?? 1,
    exitedCount: options.exitedCount ?? 0,
    capturedAt: options.capturedAt ?? capturedAt,
    recordedAt: options.recordedAt ?? recordedAt,
  };
}

describe("Issue #414 ALT-09 committed, source-backed projection", () => {
  it("classifies restricted entry only with one paired ENTERED event", () => {
    const projected = projectGeofenceViolationRow(row(), scope);
    expect(projected).toMatchObject({
      category: "ALT-09",
      severity: "CRITICAL",
      subtype: "RESTRICTED_ENTRY",
      sourceId: uuid("000000000003"),
      episodeId: uuid("000000000003"),
      taskId: uuid("000000000004"),
      trackingSessionId: uuid("000000000006"),
      mapAreaId: uuid("000000000007"),
    });
    expect(projected?.attentionAt).toBe("2026-11-04T10:05:00.000Z");
    expect(projected?.capturedAt).toBe("2026-11-04T10:00:00.000Z");
  });

  it("classifies leaving allowed union from EXITED, not mutable area purpose", () => {
    const projected = projectGeofenceViolationRow(
      row({ enteredCount: 0, exitedCount: 1 }),
      scope,
    );
    expect(projected?.subtype).toBe("LEFT_ALLOWED_UNION");
    expect(projected?.title).toBe("Geofence violation recorded");
  });

  it("does not merge distinct repeats, re-entries or takeover tracking segments", () => {
    const first = projectGeofenceViolationRow(row(), scope);
    const afterReentry = projectGeofenceViolationRow(
      row({ eventId: uuid("000000000008") }),
      scope,
    );
    const afterTakeover = projectGeofenceViolationRow(
      row({
        eventId: uuid("000000000009"),
        trackingSessionId: uuid("000000000010"),
      }),
      scope,
    );
    expect(
      new Set([
        first?.episodeId,
        afterReentry?.episodeId,
        afterTakeover?.episodeId,
      ]).size,
    ).toBe(3);
    expect(afterTakeover?.trackingSessionId).not.toBe(first?.trackingSessionId);
  });

  it("fails closed on missing, duplicate or same-ms contradictory companions", () => {
    for (const counts of [
      { enteredCount: 0, exitedCount: 0 },
      { enteredCount: 1, exitedCount: 1 },
      { enteredCount: 2, exitedCount: 0 },
      { enteredCount: 0, exitedCount: 2 },
    ]) {
      expect(projectGeofenceViolationRow(row(counts), scope)).toBeNull();
    }
  });

  it("does not treat a real same-ms source writer sequence as one proven group", () => {
    const time = new Date("2026-11-04T10:00:00Z");
    const areaId = uuid("000000000007");
    const positions = [
      ["33", "38"],
      ["31.5", "35.5"],
      ["33", "38"],
      ["31.5", "35.5"],
    ] as const;
    const generated = evaluateAdvancingGpsSamples(
      null,
      [
        {
          id: areaId,
          purpose: "RESTRICTED",
          vertices: [
            { latitude: "31", longitude: "35" },
            { latitude: "31", longitude: "36" },
            { latitude: "32", longitude: "36" },
            { latitude: "32", longitude: "35" },
          ],
        },
      ],
      positions.map(([latitude, longitude], i) => ({
        id: uuid(String(i + 10).padStart(12, "0")),
        clientSampleId: uuid(String(i + 20).padStart(12, "0")),
        latitude,
        longitude,
        capturedAt: time,
      })),
    );
    const count = (type: string) =>
      generated.filter((item) => item.type === type).length;
    expect(count("VIOLATION")).toBe(2);
    expect(count("ENTERED")).toBe(2);
    expect(count("EXITED")).toBe(1);
    // This ambiguous tied-captured-ms source must never become one alert
    // (or a falsely inferred proof ordering) merely because UUIDs sort.
    expect(
      projectGeofenceViolationRow(
        row({ enteredCount: count("ENTERED"), exitedCount: count("EXITED") }),
        scope,
      ),
    ).toBeNull();
  });

  it("rejects invalid persisted clocks, and never projects raw GPS or assignee", () => {
    expect(
      projectGeofenceViolationRow(
        row({ recordedAt: new Date(Number.NaN) }),
        scope,
      ),
    ).toBeNull();
    const projected = projectGeofenceViolationRow(row(), scope);
    expect(projected).not.toHaveProperty("latitude");
    expect(projected).not.toHaveProperty("longitude");
    expect(projected).not.toHaveProperty("route");
    expect(projected).not.toHaveProperty("assigneeMembershipId");
    expect(projected).not.toHaveProperty("currentlyOutside");
  });
});
