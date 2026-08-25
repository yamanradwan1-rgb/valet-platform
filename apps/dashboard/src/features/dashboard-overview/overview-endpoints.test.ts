import { incidentOverviewResponseSchema } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  fetchActiveShiftsPage,
  fetchIncidentsPage,
  fetchKeySlotsPage,
} from "./overview-endpoints";

const LOCATION_ID = "0f0c8a5e-6b2f-4a17-9a55-3ef2b7c9d001";

class RecordingTransport {
  public readonly calls: Array<{
    argumentCount: number;
    optionKeys: string[];
    path: string;
  }> = [];

  private readonly responses: unknown[];

  constructor(responses: unknown[]) {
    this.responses = [...responses];
  }

  async request<T>(...args: unknown[]): Promise<T> {
    const path = args[0];
    if (typeof path !== "string") throw new Error("path required");
    const options = args[1] as Record<string, unknown> | undefined;
    const optionKeys =
      typeof options === "object" && options !== null
        ? Object.keys(options)
        : [];
    this.calls.push({ argumentCount: args.length, optionKeys, path });
    const next = this.responses.shift();
    if (next === undefined) throw new Error("no stubbed response left");
    if (next instanceof Error) throw next;
    return next as T;
  }
}

function lastCall(transport: RecordingTransport): {
  argumentCount: number;
  optionKeys: string[];
  path: string;
} {
  const call = transport.calls.at(-1);
  if (call === undefined) throw new Error("expected a recorded call");
  return call;
}

describe("overview endpoints transport shape", () => {
  it("requests the exact active-shifts resource with no query when no cursor exists", async () => {
    const transport = new RecordingTransport([{ items: [], nextCursor: null }]);
    await fetchActiveShiftsPage(transport, LOCATION_ID, null);
    const call = lastCall(transport);
    expect(call.path).toBe(
      `/dashboard/locations/${LOCATION_ID}/overview/active-shifts`,
    );
  });

  it("appends the opaque cursor safely exactly once", async () => {
    const transport = new RecordingTransport([
      { items: [], nextCursor: "abc_123-cursor" },
      { items: [], nextCursor: null },
    ]);
    await fetchKeySlotsPage(transport, LOCATION_ID, "abc_123-cursor");
    expect(lastCall(transport).path).toBe(
      `/dashboard/locations/${LOCATION_ID}/overview/keys?cursor=abc_123-cursor`,
    );
  });

  it("only ever issues GET requests whose sole option is the abort signal", async () => {
    // D2-005 threads an AbortSignal for location-switch aborts; it is the
    // ONLY permitted request option — method/body overrides stay impossible.
    const transport = new RecordingTransport([
      { items: [], nextCursor: null },
      { items: [], nextCursor: null },
      { items: [], nextCursor: null },
    ]);
    const signal = new AbortController().signal;
    await fetchActiveShiftsPage(transport, LOCATION_ID, null, signal);
    await fetchKeySlotsPage(transport, LOCATION_ID, "cursor", signal);
    await fetchIncidentsPage(transport, LOCATION_ID, null, signal);
    for (const call of transport.calls) {
      expect(call.argumentCount).toBe(2);
      expect(call.optionKeys).toEqual(["signal"]);
    }
  });

  it("never sends a status filter for incidents: current-query scoping belongs to the backend", async () => {
    const transport = new RecordingTransport([
      { items: [], nextCursor: null },
    ]);
    await fetchIncidentsPage(transport, LOCATION_ID, null);
    expect(lastCall(transport).path).not.toContain("status");
    expect(lastCall(transport).path).not.toContain("?");
  });
});

describe("active-shifts response scope", () => {
  it("returns exactly the backend fields: shiftId, membershipId, startedAt", async () => {
    const payload = {
      items: [
        {
          shiftId: "954bed5d-fc7d-438a-9d39-b85f586fa101",
          membershipId: "eb39db89-54d2-45fa-a64e-29f89688f102",
          startedAt: "2026-08-24T07:00:00+03:00",
        },
      ],
      nextCursor: null,
    };
    const transport = new RecordingTransport([payload]);
    const result = await fetchActiveShiftsPage(transport, LOCATION_ID, null);
    expect(result).toStrictEqual({
      items: [
        {
          shiftId: "954bed5d-fc7d-438a-9d39-b85f586fa101",
          membershipId: "eb39db89-54d2-45fa-a64e-29f89688f102",
          startedAt: "2026-08-24T07:00:00+03:00",
        },
      ],
      nextCursor: null,
    });
  });

  it("rejects payloads carrying fields outside the contract (no invented enrichment)", async () => {
    const transport = new RecordingTransport([
      {
        items: [
          {
            shiftId: "954bed5d-fc7d-438a-9d39-b85f586fa101",
            membershipId: "eb39db89-54d2-45fa-a64e-29f89688f102",
            startedAt: "2026-08-24T07:00:00+03:00",
            employeeName: "Invented Name",
          },
        ],
        nextCursor: null,
      },
    ]);
    await expect(
      fetchActiveShiftsPage(transport, LOCATION_ID, null),
    ).rejects.toMatchObject({ code: "RESPONSE_INVALID" });
  });

  it("rejects payloads missing a required contract field", async () => {
    const transport = new RecordingTransport([
      {
        items: [{ membershipId: "eb39db89-54d2-45fa-a64e-29f89688f102" }],
        nextCursor: null,
      },
    ]);
    await expect(
      fetchActiveShiftsPage(transport, LOCATION_ID, null),
    ).rejects.toBeInstanceOf(DashboardApiError);
  });
});

describe("key-slot response scope and nullability", () => {
  const baseSlot = {
    keySlotId: "5d9b2a87-ae4a-4214-9965-d0e5b12af101",
    code: "B17",
    slotStatus: "ACTIVE",
  };

  it("renders-safe pass-through of holdingSessionId null (no fake custody data)", async () => {
    const transport = new RecordingTransport([
      { items: [{ ...baseSlot, holdingSessionId: null }], nextCursor: null },
    ]);
    const result = await fetchKeySlotsPage(transport, LOCATION_ID, null);
    expect(result.items[0]?.holdingSessionId).toBeNull();
  });

  it("preserves a present holding session id", async () => {
    const transport = new RecordingTransport([
      {
        items: [
          {
            ...baseSlot,
            holdingSessionId: "2dc14878-df98-4d0f-b164-bc2506a6b101",
          },
        ],
        nextCursor: "k_next",
      },
    ]);
    const result = await fetchKeySlotsPage(transport, LOCATION_ID, null);
    expect(result.items[0]?.holdingSessionId).toBe(
      "2dc14878-df98-4d0f-b164-bc2506a6b101",
    );
    expect(result.nextCursor).toBe("k_next");
  });

  it("accepts INACTIVE slots alongside ACTIVE ones", async () => {
    const transport = new RecordingTransport([
      {
        items: [
          { ...baseSlot, holdingSessionId: null },
          {
            keySlotId: "5d9b2a87-ae4a-4214-9965-d0e5b12af103",
            code: "B19",
            slotStatus: "INACTIVE",
            holdingSessionId: null,
          },
        ],
        nextCursor: null,
      },
    ]);
    const result = await fetchKeySlotsPage(transport, LOCATION_ID, null);
    expect(result.items.map((slot) => slot.slotStatus)).toEqual([
      "ACTIVE",
      "INACTIVE",
    ]);
  });

  it("rejects invented custody fields such as holder identity or checked-out timestamps", async () => {
    const transport = new RecordingTransport([
      {
        items: [
          {
            ...baseSlot,
            holdingSessionId: null,
            holderName: "Invented Holder",
            checkedOutAt: "2026-08-24T09:00:00+03:00",
          },
        ],
        nextCursor: null,
      },
    ]);
    await expect(
      fetchKeySlotsPage(transport, LOCATION_ID, null),
    ).rejects.toMatchObject({ code: "RESPONSE_INVALID" });
  });
});

describe("incident response scope", () => {
  const baseIncident = {
    incidentId: "a4629d58-5f2a-48f5-9d4c-8f1ce260a101",
    valetSessionId: "2dc14878-df98-4d0f-b164-bc2506a6b108",
    severity: "HIGH",
    type: "KEY_MISSING",
    description: "Key could not be found during retrieval.",
    createdAt: "2026-08-24T13:48:00+03:00",
  };

  it("accepts the statuses the current query may return: OPEN and INVESTIGATING", async () => {
    const transport = new RecordingTransport([
      {
        items: [
          { ...baseIncident, status: "OPEN", resolvedAt: null },
          {
            ...baseIncident,
            incidentId: "a4629d58-5f2a-48f5-9d4c-8f1ce260a102",
            status: "INVESTIGATING",
            severity: "MEDIUM",
            resolvedAt: null,
          },
        ],
        nextCursor: "i_next",
      },
    ]);
    const result = await fetchIncidentsPage(transport, LOCATION_ID, null);
    expect(result.items.map((incident) => incident.status)).toEqual([
      "OPEN",
      "INVESTIGATING",
    ]);
  });

  it("keeps resolvedAt null as unresolved instead of inventing a timestamp", async () => {
    const transport = new RecordingTransport([
      { items: [{ ...baseIncident, status: "OPEN", resolvedAt: null }], nextCursor: null },
    ]);
    const result = await fetchIncidentsPage(transport, LOCATION_ID, null);
    expect(result.items[0]?.resolvedAt).toBeNull();
  });

  it("passes free-string incident types through verbatim", async () => {
    const transport = new RecordingTransport([
      {
        items: [
          { ...baseIncident, status: "OPEN", type: "CUSTOMER_COMPLAINT", resolvedAt: null },
        ],
        nextCursor: null,
      },
    ]);
    const result = await fetchIncidentsPage(transport, LOCATION_ID, null);
    expect(result.items[0]?.type).toBe("CUSTOMER_COMPLAINT");
  });

  it("keeps RESOLVED/CLOSED valid in the shared global enum even though the current query never returns them", () => {
    for (const status of ["RESOLVED", "CLOSED"]) {
      const parsed = incidentOverviewResponseSchema.safeParse({
        items: [{ ...baseIncident, status, resolvedAt: "2026-08-25T10:00:00+03:00" }],
        nextCursor: null,
      });
      expect(parsed.success).toBe(true);
    }
  });
});
