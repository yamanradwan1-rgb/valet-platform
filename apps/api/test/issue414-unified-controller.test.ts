import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import type { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import type { ApiRequest } from "../src/common/http/api-request";
import type { HeaderResponse } from "../src/common/http/no-store-response";
import type { StaffSessionContextResolver } from "../src/modules/auth/staff-session-context";

const source = vi.hoisted(() => ({
  legacyList: vi.fn(),
  unifiedList: vi.fn(),
  legacyExact: vi.fn(),
  unifiedExact: vi.fn(),
  seen: vi.fn(),
}));

vi.mock("../src/modules/dashboard/management-alert-preview-query", () => ({
  listManagementAlertPreview: source.legacyList,
}));
vi.mock(
  "../src/modules/dashboard/management-alert-unified-preview-query",
  () => ({
    listUnifiedManagementAlertPreview: source.unifiedList,
  }),
);
vi.mock(
  "../src/modules/dashboard/management-alert-source-detail-query",
  () => ({
    readManagementAlertSourceDetail: source.legacyExact,
  }),
);
vi.mock(
  "../src/modules/dashboard/management-alert-unified-detail-query",
  () => ({
    readUnifiedManagementAlertDetail: source.unifiedExact,
  }),
);
vi.mock(
  "../src/modules/dashboard/management-alert-seen/management-alert-seen-command",
  () => ({
    markManagementAlertOccurrenceSeen: source.seen,
  }),
);

import { ManagementAlertPreviewController } from "../src/modules/dashboard/management-alert-preview.controller";

const locationId = "7f0b68ac-bd0f-4ea0-a4fe-4b04cfe99e9c";
const sourceId = "4e06a091-c449-47ea-a384-33773cc7df96";
const eventId = "d4265425-4b3a-4e90-ad37-616e02f75667";
const event = {
  id: "ALT-05:" + sourceId + ":" + eventId,
  caseKind: "OCCURRENCE",
  category: "ALT-05",
  severity: "CRITICAL",
  sourceKind: "TAKEOVER",
  sourceId,
  episodeId: eventId,
  locationId,
  occurredAt: "2026-11-05T10:00:00.000Z",
  title: "Emergency takeover",
  seen: false,
  seenEligible: true,
};
const active = {
  id: "ALT-16:" + locationId + ":current",
  caseKind: "ACTIVE",
  category: "ALT-16",
  severity: "IMPORTANT",
  sourceKind: "LOCATION",
  sourceId: locationId,
  episodeId: "current",
  locationId,
  occurredAt: null,
  title: "Location intake stopped",
};

const original = {
  phase1: process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED,
  phase23: process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED,
};

const request = {
  headers: { authorization: "Bearer test" },
  rawHeaders: ["Authorization", "Bearer test"],
} as ApiRequest;
function fixture() {
  const setHeader = vi.fn();
  const response = { setHeader } as HeaderResponse;
  const runner = {
    run: (_name: string, _request: ApiRequest, work: () => Promise<unknown>) =>
      work(),
  } as ApiOperationRunner;
  const resolve = vi.fn().mockResolvedValue({ userId: "signed-in-user" });
  const sessions = { resolve } as unknown as StaffSessionContextResolver;
  const pool = {} as PostgresPool;
  return {
    controller: new ManagementAlertPreviewController(pool, runner, sessions),
    pool,
    resolve,
    response,
    setHeader,
  };
}

beforeEach(() => {
  for (const mock of Object.values(source)) mock.mockReset();
  process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED = "enabled";
  delete process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED;
  source.legacyList.mockResolvedValue({ items: [], count: 0, hasMore: false });
  source.unifiedList.mockResolvedValue({
    items: [active],
    count: 1,
    hasMore: false,
  });
  source.unifiedExact.mockResolvedValue({ item: event, valetSessionId: null });
  source.seen.mockResolvedValue({
    category: "ALT-05",
    episodeId: eventId,
    seenAt: "2026-11-05T10:02:00.000Z",
  });
});
afterEach(() => {
  for (const [key, value] of [
    ["MANAGEMENT_ALERTS_PHASE1_ENABLED", original.phase1],
    ["MANAGEMENT_ALERTS_PHASE23_ENABLED", original.phase23],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Issue414 Phase23 gated controller protocol", () => {
  it("keeps the existing Phase1 preview and no-store untouched while OFF", async () => {
    const { controller, response, setHeader } = fixture();
    await expect(
      controller.preview(request, "Bearer test", locationId, response),
    ).resolves.toEqual({ items: [], count: 0, hasMore: false });
    expect(source.legacyList).toHaveBeenCalledTimes(1);
    expect(source.unifiedList).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("does not accidentally enable Phase23 when Phase1 is OFF", async () => {
    const { controller, response } = fixture();
    process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED = "disabled";
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "enabled";
    await expect(
      controller.preview(request, "Bearer test", locationId, response),
    ).rejects.toThrow();
    expect(source.legacyList).not.toHaveBeenCalled();
    expect(source.unifiedList).not.toHaveBeenCalled();
  });

  it("switches ONLY the versioned route with both flags ON, preserving old P1", async () => {
    const { controller, response, pool } = fixture();
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "enabled";
    await expect(
      controller.preview(request, "Bearer test", locationId, response),
    ).resolves.toEqual({ items: [], count: 0, hasMore: false });
    const preview = await controller.unifiedPreview(
      request,
      "Bearer test",
      locationId,
      response,
    );
    expect(preview).toMatchObject({
      count: 1,
      items: [{ category: "ALT-16", occurredAt: null }],
    });
    expect(source.legacyList).toHaveBeenCalledTimes(1);
    expect(source.unifiedList).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ locationId }),
    );
  });

  it("routes new exact source only while ON, without falling back to Phase1", async () => {
    const { controller, response } = fixture();
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "enabled";
    const result = await controller.unifiedSourceDetail(
      request,
      "Bearer test",
      locationId,
      "ALT-05",
      sourceId,
      eventId,
      response,
    );
    expect(result).toMatchObject({
      item: { category: "ALT-05", episodeId: eventId },
    });
    expect(source.unifiedExact).toHaveBeenCalledTimes(1);
    expect(source.legacyExact).not.toHaveBeenCalled();
  });

  it("never calls Seen command while OFF, even for valid explicit PUT", async () => {
    const { controller, response } = fixture();
    await expect(
      controller.markSeen(
        request,
        "Bearer test",
        locationId,
        "ALT-05",
        sourceId,
        { episodeId: eventId },
        response,
      ),
    ).rejects.toThrow();
    expect(source.seen).not.toHaveBeenCalled();
  });

  it("rejects extra/invalid Seen body without calling persistence", async () => {
    const { controller, response } = fixture();
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "enabled";
    for (const body of [
      { episodeId: eventId, forged: "true" },
      { episodeId: "invalid" },
      { seen: true },
      null,
      [],
    ]) {
      await expect(
        controller.markSeen(
          request,
          "Bearer test",
          locationId,
          "ALT-05",
          sourceId,
          body,
          response,
        ),
      ).rejects.toThrow();
    }
    expect(source.seen).not.toHaveBeenCalled();
  });

  it("routes explicit Seen as one command with category and exact event", async () => {
    const { controller, response } = fixture();
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "enabled";
    const result = await controller.markSeen(
      request,
      "Bearer test",
      locationId,
      "ALT-05",
      sourceId,
      { episodeId: eventId },
      response,
    );
    expect(result).toEqual({
      category: "ALT-05",
      episodeId: eventId,
      seenAt: "2026-11-05T10:02:00.000Z",
    });
    expect(source.seen).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        category: "ALT-05",
        sourceId,
        episodeId: eventId,
      }),
    );
  });

  it("blocks duplicate Authorization headers before reaching any source", async () => {
    const { controller, response } = fixture();
    process.env.MANAGEMENT_ALERTS_PHASE23_ENABLED = "enabled";
    const forged = {
      headers: { authorization: "Bearer one" },
      rawHeaders: [
        "Authorization",
        "Bearer one",
        "authorization",
        "Bearer two",
      ],
    } as ApiRequest;
    await expect(
      controller.unifiedPreview(forged, "Bearer one", locationId, response),
    ).rejects.toThrow();
    expect(source.unifiedList).not.toHaveBeenCalled();
  });
});
