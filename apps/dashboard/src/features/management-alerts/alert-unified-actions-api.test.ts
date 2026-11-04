import { describe, expect, it, vi } from "vitest";
import type { ManagementAlertUnifiedItem } from "@valet/contracts";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { markManagementAlertOccurrenceSeen } from "./alert-seen-api";
import { readUnifiedManagementAlertDetail } from "./alert-unified-source-api";

const locationId = "7f0b68ac-bd0f-4ea0-a4fe-4b04cfe99e9c";
const sourceId = "4e06a091-c449-47ea-a384-33773cc7df96";
const eventId = "d4265425-4b3a-4e90-ad37-616e02f75667";
const event: ManagementAlertUnifiedItem = {
  id: "ALT-05:" + sourceId + ":" + eventId,
  caseKind: "OCCURRENCE",
  category: "ALT-05",
  severity: "CRITICAL",
  sourceKind: "TAKEOVER",
  sourceId,
  episodeId: eventId,
  locationId,
  occurredAt: "2026-11-05T10:00:00.000Z",
  title: "Takeover event",
  seen: false,
  seenEligible: true,
};

function client(response: unknown) {
  const request = vi.fn().mockResolvedValue(response);
  return { api: { request } as unknown as DashboardApiClient, request };
}

describe("Issue414 explicit Seen and exact source API", () => {
  it("never issues a Seen mutation for ACTIVE conditions", async () => {
    const { api, request } = client({});
    const current = {
      ...event,
      category: "ALT-16",
      sourceKind: "LOCATION",
      caseKind: "ACTIVE",
      occurredAt: null,
    } as ManagementAlertUnifiedItem;
    await expect(
      markManagementAlertOccurrenceSeen(api, locationId, current, () => true),
    ).rejects.toThrow(/committed occurrences/);
    expect(request).not.toHaveBeenCalled();
  });

  it("issues explicit PUT and checks server-confirmed identity", async () => {
    const { api, request } = client({
      category: "ALT-05",
      episodeId: eventId,
      seenAt: "2026-11-05T10:02:00.000Z",
    });
    await markManagementAlertOccurrenceSeen(api, locationId, event, () => true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toContain(
      "/locations/" +
        locationId +
        "/alerts/sources-unified/ALT-05/" +
        sourceId +
        "/seen",
    );
    expect(request.mock.calls[0]?.[2]).toMatchObject({
      method: "PUT",
      body: { episodeId: eventId },
    });
    expect(typeof request.mock.calls[0]?.[2]?.beforeTransport).toBe("function");
  });

  it("rejects mismatched or stale Seen results", async () => {
    const { api } = client({
      category: "ALT-05",
      episodeId: sourceId,
      seenAt: "2026-11-05T10:02:00.000Z",
    });
    await expect(
      markManagementAlertOccurrenceSeen(api, locationId, event, () => true),
    ).rejects.toThrow(/does not belong/);
    const { api: valid } = client({
      category: "ALT-05",
      episodeId: eventId,
      seenAt: "2026-11-05T10:02:00.000Z",
    });
    await expect(
      markManagementAlertOccurrenceSeen(valid, locationId, event, () => false),
    ).rejects.toThrow(/does not belong/);
  });

  it("never accepts a late confirmed Seen after its panel owner aborted", async () => {
    let release: (value: unknown) => void = () => {
      throw new Error("No pending Seen transport");
    };
    const request = vi.fn().mockImplementation(
      () =>
        new Promise<unknown>((resolve) => {
          release = resolve;
        }),
    );
    const api = { request } as unknown as DashboardApiClient;
    const controller = new AbortController();
    const pending = markManagementAlertOccurrenceSeen(
      api,
      locationId,
      event,
      () => true,
      controller.signal,
    );
    controller.abort();
    release({
      category: "ALT-05",
      episodeId: eventId,
      seenAt: "2026-11-05T10:02:00.000Z",
    });
    await expect(pending).rejects.toThrow(/does not belong/);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[2]?.signal).toBe(controller.signal);
  });

  it("checks exact source ID, episode and current authority for detail", async () => {
    const { api, request } = client({
      item: { ...event, sourceId },
      valetSessionId: null,
    });
    const controller = new AbortController();
    const result = await readUnifiedManagementAlertDetail(
      api,
      locationId,
      event,
      controller.signal,
      () => true,
    );
    expect(result.item.episodeId).toBe(eventId);
    expect(request.mock.calls[0]?.[2]).toMatchObject({
      query: { episodeId: eventId },
      signal: controller.signal,
    });
    const { api: stale } = client({
      item: { ...event, sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      valetSessionId: null,
    });
    await expect(
      readUnifiedManagementAlertDetail(
        stale,
        locationId,
        event,
        controller.signal,
        () => true,
      ),
    ).rejects.toThrow(/Stale or mismatched/);
  });
});
