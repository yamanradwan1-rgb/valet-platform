import { describe, expect, it, vi } from "vitest";
import {
  auditInvestigationSearchResponseSchema,
  type AuditInvestigationSearchResponse,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import {
  readInvestigationSearchFilters,
  readInvestigationSessions,
} from "./investigation-search-client";
import {
  mapInvestigationSearchPage,
  mapInvestigationSelectorOptions,
} from "./investigation-search-model";
import {
  validateInvestigationSearchQuery,
  changeInvestigationSearchPage,
} from "./investigation-search-query";
import {
  investigationSearchScopeKey,
  validateInvestigationSearchScope,
} from "./investigation-search-scope";

const org = "11111111-1111-4111-8111-111111111111";
const location = "22222222-2222-4222-8222-222222222222";
const session = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const slotId = "55555555-5555-4555-8555-555555555555";
const memberId = "66666666-6666-4666-8666-666666666666";
const utc = "2026-10-23T11:00:00Z";
const query = {
  from: utc,
  to: "2026-10-23T12:00:00Z",
  keySlotId: slotId,
  membershipId: memberId,
};
const scope = {
  organizationId: org,
  locationId: location,
  role: "COMPANY_ADMIN" as const,
  identityGeneration: 2,
  sessionGeneration: 4,
  selectionRevision: 9,
};
const current = (value: string | null) => ({
  value,
  basis: "CURRENT" as const,
  unavailable: value === null,
});
const coverage = {
  AUDIT: { status: "AVAILABLE" as const },
  KEY_CUSTODY: { status: "AVAILABLE" as const },
  DISPATCH: {
    status: "PARTIAL" as const,
    reason: "HISTORICAL_NOT_RECORDED" as const,
  },
  INCIDENT: { status: "AVAILABLE" as const },
};

export const responseFixture: AuditInvestigationSearchResponse = {
  snapshotAt: utc,
  semanticsVersion: 1,
  nextCursor: null,
  coverage,
  items: [
    {
      sessionId: session,
      currentState: "PARKED",
      currentStateBasis: "CURRENT",
      currentVehicle: {
        make: current("Toyota"),
        model: current(null),
        plate: current(null),
        plateCountry: current(null),
        temporaryDescriptor: current(null),
      },
      currentKeySlot: { keySlotId: null, code: current(null) },
      firstMatchedAt: utc,
      lastMatchedAt: utc,
      matchingRecordCount: 1,
      matchReasons: [
        {
          source: "KEY_CUSTODY",
          eventId,
          matchedBy: "EMPLOYEE",
          participationRole: "PREVIOUS_ASSIGNEE",
        },
      ],
      hasVisibleIncident: true,
      matchedIncidentCount: 0,
      coverage,
    },
  ],
};

describe("W5 strict query and exact scope", () => {
  it("requires canonical IDs, UTC window, allowed fields and a single location", () => {
    expect(validateInvestigationSearchQuery(query)).toMatchObject({
      limit: 25,
    });
    expect(() =>
      validateInvestigationSearchQuery({ ...query, keySlotId: "K-07" }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchQuery({ ...query, membershipId: "Samir" }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchQuery({ ...query, from: "2026-10-23T14:00" }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchQuery({ ...query, descriptor: "SUV" }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchQuery({ ...query, role: "ORG_ADMIN" }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchQuery({ ...query, to: utc }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchScope({ ...scope, role: "SUPERVISOR" }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchScope({ ...scope, locationId: "" }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchScope({ ...scope, selectionRevision: -1 }),
    ).toThrow();
    expect(() =>
      validateInvestigationSearchScope({ ...scope, tenantId: org }),
    ).toThrow();
    expect(investigationSearchScopeKey(scope)).not.toBe(
      investigationSearchScopeKey({ ...scope, sessionGeneration: 5 }),
    );
    expect(
      changeInvestigationSearchPage(
        validateInvestigationSearchQuery({ ...query, cursor: "abcdefgh" }),
        null,
      ).cursor,
    ).toBeUndefined();
  });

  it("uses authenticated exact-Location API and W1 response validation", async () => {
    const request = vi.fn().mockResolvedValue(responseFixture);
    const api = { request } as unknown as Pick<DashboardApiClient, "request">;
    const signal = new AbortController().signal;
    const onAuthReconciled = vi.fn();
    const result = await readInvestigationSessions(
      { api, scope, signal, onAuthReconciled },
      validateInvestigationSearchQuery(query),
    );
    expect(result.items).toHaveLength(1);
    expect(request).toHaveBeenCalledWith(
      `/v1/staff/management/organizations/${org}/locations/${location}/audit-investigations/sessions`,
      auditInvestigationSearchResponseSchema,
      expect.objectContaining({
        method: "GET",
        signal,
        onAuthReconciled,
        query: expect.objectContaining({
          keySlotId: slotId,
          membershipId: memberId,
        }),
      }),
    );
    expect(JSON.stringify(request.mock.calls)).not.toContain("K-07");
    expect(JSON.stringify(request.mock.calls)).not.toContain("Samir");
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      readInvestigationSessions(
        {
          api,
          scope,
          signal: cancelled.signal,
          onAuthReconciled,
        },
        validateInvestigationSearchQuery(query),
      ),
    ).rejects.toBeDefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("constrains selector IDs and truthful unavailable/current labels", async () => {
    const request = vi.fn().mockResolvedValue({
      kind: "MEMBER",
      items: [{ id: memberId, currentLabel: current(null) }],
      nextCursor: null,
      hasMore: false,
    });
    const api = { request } as unknown as Pick<DashboardApiClient, "request">;
    const raw = await readInvestigationSearchFilters(
      {
        api,
        scope,
        signal: new AbortController().signal,
        onAuthReconciled: vi.fn(),
      },
      { kind: "MEMBER", text: "Samir", limit: 20 },
    );
    expect(mapInvestigationSelectorOptions(raw)).toEqual([
      { id: memberId, label: current(null) },
    ]);
    expect(request.mock.calls[0]?.[0]).toMatch(
      /audit-investigations\/filters$/,
    );
    expect(() =>
      auditInvestigationSearchResponseSchema.parse({
        ...responseFixture,
        items: [
          { ...responseFixture.items[0], currentStateBasis: "HISTORICAL" },
        ],
      }),
    ).toThrow();
  });

  it("keeps witness counts, incident scope and current labels separate", () => {
    expect(
      auditInvestigationSearchResponseSchema.parse(responseFixture),
    ).toBeTruthy();
    const row = mapInvestigationSearchPage(responseFixture).items[0]!;
    expect(row.currentVehicle.make).toEqual(current("Toyota"));
    expect(row.currentVehicle.plate).toEqual(current(null));
    expect(row.currentKeySlot.keySlotId).toBeNull();
    expect(row.matchReasons[0]).toMatchObject({
      matchedBy: "EMPLOYEE",
      participationRole: "PREVIOUS_ASSIGNEE",
    });
    expect(row.hasVisibleIncident).toBe(true);
    expect(row.matchedIncidentCount).toBe(0);
    expect(row.matchingRecordCount).toBe(1);
    expect("historicalSlot" in row).toBe(false);
    expect("actorName" in row).toBe(false);
  });
});
