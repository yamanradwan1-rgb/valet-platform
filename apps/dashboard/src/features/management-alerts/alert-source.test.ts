import { describe, expect, it } from "vitest";
import { alertSourceSchema } from "./alert-source-api";
import {
  alertSourceHref,
  parseAlertSourceIntent,
} from "./alert-source-intent";
import type { ManagementAlertItem } from "./alert-model";

const item: ManagementAlertItem = {
  id: "attention-1",
  category: "ALT-08",
  severity: "CRITICAL",
  sourceKind: "INCIDENT",
  sourceId: "incident-1",
  episodeId: "episode/old?special=1",
  locationId: "location-1",
  occurredAt: "2026-11-04T00:00:00Z",
  title: "A scoped urgent incident",
};

describe("exact source navigation", () => {
  it("routes approved Phase-1 cases to owning screens with encoded episode identity", () => {
    for (const [category, kind, route] of [
      ["ALT-01", "RETRIEVAL", "/live-operations"],
      ["ALT-02", "TASK", "/tasks"],
      ["ALT-03", "TASK", "/tasks"],
      ["ALT-08", "INCIDENT", "/incidents"],
      ["ALT-12", "PRESENCE", "/policies"],
    ] as const) {
      const concrete = { ...item, category, sourceKind: kind };
      const href = alertSourceHref(concrete);
      const url = new URL(href, "https://local.invalid");
      expect(url.pathname).toBe(route);
      expect(url.searchParams.get("alertEpisodeId")).toBe(item.episodeId);
      if (kind === "PRESENCE") expect(url.searchParams.get("section")).toBe("presence");
      expect(parseAlertSourceIntent(url.searchParams, kind)).toEqual({
        category, sourceId: item.sourceId, episodeId: item.episodeId,
      });
    }
  });

  it("rejects duplicate, malformed, mismatched or oversized selectors", () => {
    const base = new URL(alertSourceHref(item), "https://local.invalid");
    expect(parseAlertSourceIntent(base.searchParams, "TASK")).toBeNull();
    base.searchParams.append("alertCategory", "ALT-01");
    expect(parseAlertSourceIntent(base.searchParams, "INCIDENT")).toBeNull();
    base.searchParams.delete("alertCategory");
    base.searchParams.append("alertCategory", "ALT-99");
    expect(parseAlertSourceIntent(base.searchParams, "INCIDENT")).toBeNull();
    base.searchParams.set("alertCategory", "ALT-08");
    base.searchParams.set("alertSourceId", "x".repeat(300));
    expect(parseAlertSourceIntent(base.searchParams, "INCIDENT")).toBeNull();
  });

  it("accepts only a fresh, exact episode and exact Location from a typed GET", () => {
    const intent = {
      category: item.category,
      sourceId: item.sourceId,
      episodeId: item.episodeId,
    };
    const response = { item, valetSessionId: null };
    const schema = alertSourceSchema(item.locationId, intent);
    expect(schema.safeParse(response).success).toBe(true);
    expect(schema.safeParse({
      ...response,
      item: { ...item, episodeId: "replacement-episode" },
    }).success).toBe(false);
    expect(schema.safeParse({
      ...response,
      item: { ...item, locationId: "other-location" },
    }).success).toBe(false);
    expect(schema.safeParse({
      ...response, valetSessionId: "invalid",
    }).success).toBe(false);
    expect(schema.safeParse({
      ...response, item: { ...item, sourceId: "another-incident" },
    }).success).toBe(false);
  });
});
