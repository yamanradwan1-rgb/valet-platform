import { describe, expect, it } from "vitest";
import { managementAlertPreviewResponseSchema } from "@valet/contracts";
import {
  correlateManagementAlertPreview,
  type ManagementAlertCandidate,
} from "../src/modules/dashboard/management-alert-correlation";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const locationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const incidentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const scope = { organizationId, locationId };

function candidate(
  overrides: Partial<ManagementAlertCandidate> = {},
): ManagementAlertCandidate {
  return {
    category: "ALT-08",
    episodeId: incidentId,
    locationId,
    occurredAt: "2026-11-04T01:00:00.000Z",
    organizationId,
    severity: "CRITICAL",
    sourceId: incidentId,
    sourceKind: "INCIDENT",
    title: "Critical incident",
    ...overrides,
  };
}

describe("Issue #414 source-authorized alert correlation", () => {
  it("returns the same badge count as its distinct preview", () => {
    const caseA = candidate();
    const result = correlateManagementAlertPreview([caseA, caseA], scope);
    expect(result.count).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(result.items[0]?.id).toBe(`ALT-08:${incidentId}:${incidentId}`);
    expect(managementAlertPreviewResponseSchema.safeParse(result).success).toBe(
      true,
    );
  });

  it("sorts critical ahead of newer important cases and is deterministic", () => {
    const cases = [
      candidate({
        category: "ALT-12",
        sourceKind: "PRESENCE",
        severity: "IMPORTANT",
        title: "Presence exception",
        occurredAt: "2026-11-04T04:00:00.000Z",
      }),
      candidate(),
    ];
    expect(
      correlateManagementAlertPreview(cases, scope).items.map(
        (item) => item.category,
      ),
    ).toEqual(["ALT-08", "ALT-12"]);
  });

  it("proves overflow only after 21 distinct eligible cases", () => {
    const cases = Array.from({ length: 21 }, (_, index) =>
      candidate({
        sourceId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        episodeId: `episode-${index}`,
      }),
    );
    const twenty = correlateManagementAlertPreview(cases.slice(0, 20), scope);
    const twentyOne = correlateManagementAlertPreview(cases, scope);
    expect(twenty.hasMore).toBe(false);
    expect(twenty.count).toBe(20);
    expect(twentyOne.hasMore).toBe(true);
    expect(twentyOne.count).toBe(20);
    expect(twentyOne.items).toHaveLength(20);
  });

  it("fails closed for contradictory uncovered Task episode evidence", () => {
    const task = candidate({
      category: "ALT-02",
      sourceKind: "TASK",
      severity: "IMPORTANT",
      title: "Task needs assignment",
      episodeId: "1",
    });
    const declined = { ...task, category: "ALT-03" as const, episodeId: "2" };
    const preview = correlateManagementAlertPreview([task, declined], scope);
    expect(preview.count).toBe(0);
    expect(preview.hasMore).toBe(false);
  });

  it("rejects a mistaken cross-organization or cross-Location source row", () => {
    expect(() =>
      correlateManagementAlertPreview(
        [candidate({ organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" })],
        scope,
      ),
    ).toThrow(/outside the authorized scope/);
    expect(() =>
      correlateManagementAlertPreview(
        [candidate({ locationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" })],
        scope,
      ),
    ).toThrow(/outside the authorized scope/);
  });
});
