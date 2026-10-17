import { describe, expect, it, vi } from "vitest";
import type { AuditInvestigationSearchResponse } from "@valet/contracts";

import {
  InvestigationSearchController,
  type InvestigationSearchReader,
} from "./investigation-search-controller";
import { validateInvestigationSearchQuery } from "./investigation-search-query";

const org = "11111111-1111-4111-8111-111111111111";
const locA = "22222222-2222-4222-8222-222222222222";
const locB = "77777777-7777-4777-8777-777777777777";
const id = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const query = validateInvestigationSearchQuery({
  from: "2026-10-23T11:00:00Z",
  to: "2026-10-23T12:00:00Z",
});
const scope = {
  organizationId: org,
  locationId: locA,
  role: "LOCATION_MANAGER" as const,
  identityGeneration: 1,
  sessionGeneration: 5,
  selectionRevision: 3,
};
const coverage = {
  AUDIT: { status: "AVAILABLE" as const },
  KEY_CUSTODY: { status: "AVAILABLE" as const },
  DISPATCH: { status: "AVAILABLE" as const },
  INCIDENT: { status: "AVAILABLE" as const },
};
const label = { value: null, unavailable: true, basis: "CURRENT" as const };
const fakeResponse = (
  cursor: string | null = null,
  snapshotAt = query.from,
  sessionId = id,
): AuditInvestigationSearchResponse => ({
  items: [
    {
      sessionId,
      currentState: "PARKED",
      currentStateBasis: "CURRENT",
      currentVehicle: {
        make: label,
        model: label,
        plate: label,
        plateCountry: label,
        temporaryDescriptor: label,
      },
      currentKeySlot: { keySlotId: null, code: label },
      firstMatchedAt: query.from,
      lastMatchedAt: query.from,
      matchingRecordCount: 1,
      matchReasons: [{ source: "AUDIT", eventId, matchedBy: "WINDOW" }],
      hasVisibleIncident: false,
      matchedIncidentCount: 0,
      coverage,
    },
  ],
  nextCursor: cursor,
  snapshotAt,
  coverage,
  semanticsVersion: 1,
});

type Pending = {
  readonly signal: AbortSignal;
  readonly resolve: (response: AuditInvestigationSearchResponse) => void;
  readonly reject: (error: Error) => void;
  readonly reconciled: () => void;
};

function pendingReader() {
  const pending: Pending[] = [];
  const reader: InvestigationSearchReader = (context) =>
    new Promise((resolve, reject) => {
      pending.push({
        signal: context.signal,
        reconciled: context.onAuthReconciled,
        resolve,
        reject,
      });
    });
  return { reader, pending };
}

// The typed API is injected; these tests never open HTTP, browser or a DB.
const unusedApi = {} as Parameters<InvestigationSearchController["apply"]>[0];

describe("W5 scope-generation, abort and pagination", () => {
  it("never requests without exact scope and resets on loss of authorization", async () => {
    const { reader, pending } = pendingReader();
    const controller = new InvestigationSearchController(reader);
    expect(await controller.apply(unusedApi, query)).toBe(false);
    controller.configure(scope);
    const first = controller.apply(unusedApi, query);
    expect(pending).toHaveLength(1);
    expect(controller.snapshot().status).toBe("loading");
    controller.configure(null);
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[0]!.resolve(fakeResponse());
    expect(await first).toBe(false);
    expect(controller.snapshot()).toMatchObject({
      status: "idle",
      page: null,
      query: null,
      error: null,
    });
  });

  it("discards stale responses even if the reader ignores abort", async () => {
    const { reader, pending } = pendingReader();
    const controller = new InvestigationSearchController(reader);
    controller.configure(scope);
    const old = controller.apply(unusedApi, query);
    controller.configure({ ...scope, locationId: locB });
    const fresh = controller.apply(unusedApi, query);
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[0]!.resolve(fakeResponse());
    expect(await old).toBe(false);
    expect(controller.snapshot().page).toBeNull();
    pending[1]!.resolve(fakeResponse());
    expect(await fresh).toBe(true);
    expect(controller.snapshot().page?.items[0]?.sessionId).toBe(id);
    expect(controller.snapshot().status).toBe("ready");
  });

  it("aborts preceding apply and fences current auth reconciliation", async () => {
    const { reader, pending } = pendingReader();
    const controller = new InvestigationSearchController(reader);
    controller.configure(scope);
    const old = controller.apply(unusedApi, query);
    const latest = controller.apply(unusedApi, { ...query, make: "Hyundai" });
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[0]!.reject(new Error("late network failure"));
    expect(await old).toBe(false);
    pending[1]!.reconciled();
    pending[1]!.resolve(fakeResponse());
    expect(await latest).toBe(false);
    expect(controller.snapshot().page).toBeNull();
    expect(await controller.apply(unusedApi, query)).toBe(false);
  });

  it("loads a cursor only after Apply, fences inconsistent page snapshots", async () => {
    const { reader, pending } = pendingReader();
    const controller = new InvestigationSearchController(reader);
    controller.configure(scope);
    expect(await controller.next(unusedApi)).toBe(false);
    const applied = controller.apply(unusedApi, query);
    pending[0]!.resolve(fakeResponse("abcdefgh"));
    expect(await applied).toBe(true);
    const next = controller.next(unusedApi);
    expect(pending).toHaveLength(2);
    expect(controller.snapshot().loadingMore).toBe(true);
    expect(await controller.next(unusedApi)).toBe(false);
    pending[1]!.resolve(fakeResponse(null, "2026-10-23T11:00:01Z"));
    expect(await next).toBe(false);
    expect(controller.snapshot()).toMatchObject({
      status: "error",
      page: null,
      loadingMore: false,
    });
  });

  it("accepts consistent continuations and invalidates on identity generation", async () => {
    const { reader, pending } = pendingReader();
    const controller = new InvestigationSearchController(reader);
    controller.configure(scope);
    const first = controller.apply(unusedApi, query);
    pending[0]!.resolve(fakeResponse("abcdefgh"));
    expect(await first).toBe(true);
    const second = controller.next(unusedApi);
    pending[1]!.resolve(fakeResponse(null, query.from, locB));
    expect(await second).toBe(true);
    expect(controller.snapshot().page?.items).toHaveLength(2);
    controller.configure({ ...scope, identityGeneration: 2 });
    expect(controller.snapshot().page).toBeNull();
    expect(controller.snapshot().status).toBe("idle");
    const newest = controller.apply(unusedApi, query);
    controller.dispose();
    expect(pending[2]!.signal.aborted).toBe(true);
    pending[2]!.resolve(fakeResponse());
    expect(await newest).toBe(false);
  });

  it("rejects invalid queries before opening requests", async () => {
    const reader = vi.fn<InvestigationSearchReader>();
    const controller = new InvestigationSearchController(reader);
    controller.configure(scope);
    await expect(
      controller.apply(unusedApi, {
        ...query,
        keySlotId: "K-07",
      }),
    ).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
    expect(controller.snapshot().status).toBe("idle");
  });

  it("detects changed live-current make filters and clears inconsistent data", async () => {
    const { reader, pending } = pendingReader();
    const controller = new InvestigationSearchController(reader);
    controller.configure(scope);
    const first = controller.apply(unusedApi, { ...query, make: "Toyota" });
    // The server saw the vehicle after its current make changed or disagreed.
    pending[0]!.resolve(fakeResponse());
    expect(await first).toBe(false);
    expect(controller.snapshot().status).toBe("error");
    expect(controller.snapshot().page).toBeNull();
    await expect(
      controller.apply(unusedApi, {
        ...query,
        membershipId: "Samir",
      }),
    ).rejects.toThrow();
    expect(controller.snapshot().status).toBe("idle");
  });
});
